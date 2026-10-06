import { Logger } from '@nestjs/common';
import {
  DAY_MS,
  ERROR_LOG_PURGE_BATCH,
  ERROR_LOG_PURGE_LOCK_KEY,
  ERROR_LOG_PURGE_LOCK_SECONDS,
} from './error-log-retention.const';
import { ErrorLogRetentionService } from './error-log-retention.service';

const NOW = new Date('2026-10-06T15:00:00.000Z');

function setup(env: Record<string, unknown>, batches: number[], lock: string | null = 'OK') {
  const qb = {
    delete: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  batches.forEach((affected) => qb.execute.mockResolvedValueOnce({ affected }));
  const repo = { createQueryBuilder: jest.fn(() => qb) };
  const redis = {
    set: jest.fn().mockResolvedValue(lock),
    eval: jest.fn().mockResolvedValue(1),
  };
  const config = { get: jest.fn((key: string) => env[key]) };
  const service = new ErrorLogRetentionService(repo as any, redis as any, config as any);
  return { service, qb, redis };
}

describe('ErrorLogRetentionService', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('the cutoff is now minus ERROR_LOG_RETENTION_DAYS from the env', async () => {
    const { service, qb } = setup({ ERROR_LOG_RETENTION_DAYS: '30' }, [0]);

    const result = await service.purge();

    expect(result).toEqual({ skipped: false, deleted: 0, retentionDays: 30 });
    const [sql, params] = qb.where.mock.calls[0];
    expect(sql).toContain('FROM auditoria.error_log WHERE occurred_at < :cutoff ORDER BY occurred_at LIMIT :limit');
    expect(params).toEqual({ cutoff: new Date(NOW.getTime() - 30 * DAY_MS), limit: ERROR_LOG_PURGE_BATCH });
  });

  it('deletes in batches with one fixed cutoff until one comes back short, and reports the total', async () => {
    const { service, qb } = setup({}, [ERROR_LOG_PURGE_BATCH, ERROR_LOG_PURGE_BATCH, 17]);

    const result = await service.purge();

    expect(qb.execute).toHaveBeenCalledTimes(3);
    const cutoffs = qb.where.mock.calls.map(([, params]) => params.cutoff.getTime());
    expect(new Set(cutoffs)).toEqual(new Set([NOW.getTime() - 7 * DAY_MS]));
    expect(result).toEqual({ skipped: false, deleted: 2 * ERROR_LOG_PURGE_BATCH + 17, retentionDays: 7 });
  });

  it.each(['0', '-5', 'abc', '7.5', '30d'])('ERROR_LOG_RETENTION_DAYS=%s falls back to 7 with a warning', async (raw) => {
    const { service, qb } = setup({ ERROR_LOG_RETENTION_DAYS: raw }, [0]);

    await service.purge();

    expect(service.retentionDays).toBe(7);
    expect(qb.where.mock.calls[0][1].cutoff).toEqual(new Date(NOW.getTime() - 7 * DAY_MS));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`ERROR_LOG_RETENTION_DAYS="${raw}"`));
  });

  it('an unset variable uses 7 without warning', () => {
    const { service } = setup({}, []);
    expect(service.retentionDays).toBe(7);
    expect(warn).not.toHaveBeenCalled();
  });

  it('when another instance holds the lock nothing is deleted', async () => {
    const { service, qb, redis } = setup({}, [500], null);

    const result = await service.purge();

    expect(redis.set).toHaveBeenCalledWith(ERROR_LOG_PURGE_LOCK_KEY, expect.any(String), {
      NX: true,
      EX: ERROR_LOG_PURGE_LOCK_SECONDS,
    });
    expect(qb.execute).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true, deleted: 0, retentionDays: 7 });
  });

  it('releases its own lock even when a batch fails', async () => {
    const { service, qb, redis } = setup({}, []);
    qb.execute.mockRejectedValueOnce(new Error('db down'));

    await expect(service.purge()).rejects.toThrow('db down');

    const token = redis.set.mock.calls[0][1];
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: [ERROR_LOG_PURGE_LOCK_KEY],
      arguments: [token],
    });
  });

  it('a failed lock release is logged, not thrown', async () => {
    const { service, redis } = setup({}, [0]);
    redis.eval.mockRejectedValueOnce(new Error('redis gone'));

    await expect(service.purge()).resolves.toMatchObject({ skipped: false, deleted: 0 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('redis gone'));
  });
});
