import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { RedisClientType } from 'redis';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { PurgeResult, resolveRetentionDays, withRedisLock } from 'src/maintenance/retention.util';
import { Repository } from 'typeorm';
import {
  DAY_MS,
  DEFAULT_ERROR_LOG_RETENTION_DAYS,
  ERROR_LOG_PURGE_BATCH,
  ERROR_LOG_PURGE_LOCK_KEY,
  ERROR_LOG_PURGE_LOCK_SECONDS,
} from './error-log-retention.const';
import { ErrorLog } from './entities/error-log.entity';

/** Deletes error-log rows older than ERROR_LOG_RETENTION_DAYS in small batches, one instance at a time. */
@Injectable()
export class ErrorLogRetentionService {
  private readonly logger = new Logger(ErrorLogRetentionService.name);
  readonly retentionDays: number;

  constructor(
    @InjectRepository(ErrorLog, DatabaseConnectionName.DB_MAIN)
    private readonly errorLog: Repository<ErrorLog>,
    @Inject('REDIS_SESSION_CLIENT')
    private readonly redis: RedisClientType,
    config: ConfigService,
  ) {
    this.retentionDays = resolveRetentionDays(
      config.get('ERROR_LOG_RETENTION_DAYS'),
      'ERROR_LOG_RETENTION_DAYS',
      DEFAULT_ERROR_LOG_RETENTION_DAYS,
      this.logger,
    );
  }

  async purge(): Promise<PurgeResult> {
    // occurred_at is written from a Node Date (HttpExceptionFilter), so the cutoff is a Node Date too: same clock and serialization.
    const cutoff = new Date(Date.now() - this.retentionDays * DAY_MS);
    const run = await withRedisLock(this.redis, ERROR_LOG_PURGE_LOCK_KEY, ERROR_LOG_PURGE_LOCK_SECONDS, this.logger, async () => {
      let deleted = 0;
      let batch: number;
      do {
        batch = await this.deleteBatch(cutoff);
        deleted += batch;
      } while (batch >= ERROR_LOG_PURGE_BATCH);
      return deleted;
    });
    if (!run.acquired) {
      this.logger.log('Purga de error_log omitida: otra instancia la está ejecutando.');
      return { skipped: true, deleted: 0, retentionDays: this.retentionDays };
    }
    this.logger.log(`Purga de error_log: ${run.value} filas con más de ${this.retentionDays} días eliminadas.`);
    return { skipped: false, deleted: run.value, retentionDays: this.retentionDays };
  }

  /** One short DELETE per batch keeps row locks and WAL bursts small; the subselect walks idx_error_log_occurred_at. */
  private async deleteBatch(cutoff: Date): Promise<number> {
    const result = await this.errorLog
      .createQueryBuilder()
      .delete()
      .where(
        `id IN (SELECT id FROM auditoria.error_log WHERE occurred_at < :cutoff ORDER BY occurred_at LIMIT :limit)`,
        { cutoff, limit: ERROR_LOG_PURGE_BATCH },
      )
      .execute();
    return result.affected ?? 0;
  }
}
