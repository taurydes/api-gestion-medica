import { Logger } from '@nestjs/common';
import {
  ACCESS_LOG_PURGE_BATCH,
  ACCESS_LOG_PURGE_LOCK_KEY,
  ACCESS_LOG_PURGE_LOCK_SECONDS,
} from './access-log-retention.const';
import { AccessLogRetentionService } from './access-log-retention.service';

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
  const service = new AccessLogRetentionService(repo as any, redis as any, config as any);
  return { service, qb, redis };
}

describe('AccessLogRetentionService', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('the cutoff uses ACCESS_LOG_RETENTION_DAYS from the env', async () => {
    const { service, qb } = setup({ ACCESS_LOG_RETENTION_DAYS: '30' }, [0]);

    const result = await service.purge();

    expect(result).toEqual({ skipped: false, deleted: 0, retentionDays: 30 });
    const [sql, params] = qb.where.mock.calls[0];
    expect(sql).toContain('created_at < now() - make_interval(days => :days)');
    expect(params).toEqual({ days: 30, limit: ACCESS_LOG_PURGE_BATCH });
  });

  it('deletes in batches until one comes back short, and reports the total', async () => {
    const { service, qb } = setup({}, [ACCESS_LOG_PURGE_BATCH, ACCESS_LOG_PURGE_BATCH, 1234]);

    const result = await service.purge();

    expect(qb.execute).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ skipped: false, deleted: 2 * ACCESS_LOG_PURGE_BATCH + 1234, retentionDays: 90 });
  });

  it.each(['0', '-5', 'abc', '7.5', '30d'])('ACCESS_LOG_RETENTION_DAYS=%s falls back to 90 with a warning', async (raw) => {
    const { service, qb } = setup({ ACCESS_LOG_RETENTION_DAYS: raw }, [0]);

    await service.purge();

    expect(service.retentionDays).toBe(90);
    expect(qb.where.mock.calls[0][1]).toMatchObject({ days: 90 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`"${raw}"`));
  });

  it('an unset variable uses 90 without warning', () => {
    const { service } = setup({}, []);
    expect(service.retentionDays).toBe(90);
    expect(warn).not.toHaveBeenCalled();
  });

  it('when another instance holds the lock nothing is deleted', async () => {
    const { service, qb, redis } = setup({}, [500], null);

    const result = await service.purge();

    expect(redis.set).toHaveBeenCalledWith(ACCESS_LOG_PURGE_LOCK_KEY, expect.any(String), {
      NX: true,
      EX: ACCESS_LOG_PURGE_LOCK_SECONDS,
    });
    expect(qb.execute).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true, deleted: 0, retentionDays: 90 });
  });

  it('releases its own lock even when a batch fails', async () => {
    const { service, qb, redis } = setup({}, []);
    qb.execute.mockRejectedValueOnce(new Error('db down'));

    await expect(service.purge()).rejects.toThrow('db down');

    const token = redis.set.mock.calls[0][1];
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: [ACCESS_LOG_PURGE_LOCK_KEY],
      arguments: [token],
    });
  });
});
