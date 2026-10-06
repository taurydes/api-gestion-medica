import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { RedisClientType } from 'redis';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Repository } from 'typeorm';
import {
  ACCESS_LOG_PURGE_BATCH,
  ACCESS_LOG_PURGE_LOCK_KEY,
  ACCESS_LOG_PURGE_LOCK_SECONDS,
  DEFAULT_ACCESS_LOG_RETENTION_DAYS,
  parseRetentionDays,
} from './access-log-retention.const';
import { AccessLog } from './entities/access-log.entity';

export interface PurgeResult {
  skipped: boolean;
  deleted: number;
  retentionDays: number;
}

// Deletes only when the lock still holds our token, so an expired lock never frees another instance's run.
const RELEASE_LOCK = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/** Deletes access-log rows older than ACCESS_LOG_RETENTION_DAYS in small batches, one instance at a time. */
@Injectable()
export class AccessLogRetentionService {
  private readonly logger = new Logger(AccessLogRetentionService.name);
  readonly retentionDays: number;

  constructor(
    @InjectRepository(AccessLog, DatabaseConnectionName.DB_MAIN)
    private readonly accessLog: Repository<AccessLog>,
    @Inject('REDIS_SESSION_CLIENT')
    private readonly redis: RedisClientType,
    config: ConfigService,
  ) {
    const raw = config.get('ACCESS_LOG_RETENTION_DAYS');
    const parsed = parseRetentionDays(raw);
    if (parsed === null) {
      this.logger.warn(
        `ACCESS_LOG_RETENTION_DAYS="${raw}" no es un entero >= 1; se usan ${DEFAULT_ACCESS_LOG_RETENTION_DAYS} días.`,
      );
    }
    this.retentionDays = parsed ?? DEFAULT_ACCESS_LOG_RETENTION_DAYS;
  }

  async purge(): Promise<PurgeResult> {
    const token = randomUUID();
    const acquired = await this.redis.set(ACCESS_LOG_PURGE_LOCK_KEY, token, {
      NX: true,
      EX: ACCESS_LOG_PURGE_LOCK_SECONDS,
    });
    if (acquired !== 'OK') {
      this.logger.log('Purga de access_log omitida: otra instancia la está ejecutando.');
      return { skipped: true, deleted: 0, retentionDays: this.retentionDays };
    }

    try {
      let deleted = 0;
      let batch: number;
      do {
        batch = await this.deleteBatch();
        deleted += batch;
      } while (batch >= ACCESS_LOG_PURGE_BATCH);
      this.logger.log(
        `Purga de access_log: ${deleted} filas con más de ${this.retentionDays} días eliminadas.`,
      );
      return { skipped: false, deleted, retentionDays: this.retentionDays };
    } finally {
      await this.redis
        .eval(RELEASE_LOCK, { keys: [ACCESS_LOG_PURGE_LOCK_KEY], arguments: [token] })
        .catch((err) => this.logger.warn(`No se pudo liberar el lock de purga: ${err?.message ?? err}`));
    }
  }

  /** One short DELETE per batch keeps row locks and WAL bursts small; the cutoff uses the DB clock like created_at. */
  private async deleteBatch(): Promise<number> {
    const result = await this.accessLog
      .createQueryBuilder()
      .delete()
      .where(
        `id IN (SELECT id FROM auditoria.access_log WHERE created_at < now() - make_interval(days => :days) ORDER BY created_at LIMIT :limit)`,
        { days: this.retentionDays, limit: ACCESS_LOG_PURGE_BATCH },
      )
      .execute();
    return result.affected ?? 0;
  }
}
