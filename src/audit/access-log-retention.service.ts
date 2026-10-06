import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { RedisClientType } from 'redis';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { PurgeResult, resolveRetentionDays, withRedisLock } from 'src/maintenance/retention.util';
import { Repository } from 'typeorm';
import {
  ACCESS_LOG_PURGE_BATCH,
  ACCESS_LOG_PURGE_LOCK_KEY,
  ACCESS_LOG_PURGE_LOCK_SECONDS,
  DEFAULT_ACCESS_LOG_RETENTION_DAYS,
} from './access-log-retention.const';
import { AccessLog } from './entities/access-log.entity';

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
    this.retentionDays = resolveRetentionDays(
      config.get('ACCESS_LOG_RETENTION_DAYS'),
      'ACCESS_LOG_RETENTION_DAYS',
      DEFAULT_ACCESS_LOG_RETENTION_DAYS,
      this.logger,
    );
  }

  async purge(): Promise<PurgeResult> {
    const run = await withRedisLock(this.redis, ACCESS_LOG_PURGE_LOCK_KEY, ACCESS_LOG_PURGE_LOCK_SECONDS, this.logger, async () => {
      let deleted = 0;
      let batch: number;
      do {
        batch = await this.deleteBatch();
        deleted += batch;
      } while (batch >= ACCESS_LOG_PURGE_BATCH);
      return deleted;
    });
    if (!run.acquired) {
      this.logger.log('Purga de access_log omitida: otra instancia la está ejecutando.');
      return { skipped: true, deleted: 0, retentionDays: this.retentionDays };
    }
    this.logger.log(`Purga de access_log: ${run.value} filas con más de ${this.retentionDays} días eliminadas.`);
    return { skipped: false, deleted: run.value, retentionDays: this.retentionDays };
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
