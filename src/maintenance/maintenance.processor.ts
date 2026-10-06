import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { ACCESS_LOG_PURGE_CRON, ACCESS_LOG_PURGE_JOB } from 'src/audit/access-log-retention.const';
import { AccessLogRetentionService } from 'src/audit/access-log-retention.service';
import { ERROR_LOG_PURGE_CRON, ERROR_LOG_PURGE_JOB } from 'src/logs/error-log-retention.const';
import { ErrorLogRetentionService } from 'src/logs/error-log-retention.service';
import { MAINTENANCE_QUEUE } from './maintenance.const';
import { PurgeResult } from './retention.util';

/** Single worker of the `maintenance` queue: registers each nightly purge as a job scheduler and dispatches by job name. */
@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceProcessor.name);
  private readonly jobs: Record<string, { cron: string; run: () => Promise<PurgeResult> }>;

  constructor(
    accessLogRetention: AccessLogRetentionService,
    errorLogRetention: ErrorLogRetentionService,
    private readonly config: ConfigService,
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
  ) {
    super();
    this.jobs = {
      [ACCESS_LOG_PURGE_JOB]: { cron: ACCESS_LOG_PURGE_CRON, run: () => accessLogRetention.purge() },
      [ERROR_LOG_PURGE_JOB]: { cron: ERROR_LOG_PURGE_CRON, run: () => errorLogRetention.purge() },
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    // Upsert by a fixed id is idempotent: every instance can call it and Redis keeps one schedule per job.
    for (const [name, { cron }] of Object.entries(this.jobs)) {
      try {
        await this.queue.upsertJobScheduler(
          name,
          { pattern: cron, tz: this.config.get('TZ') || undefined },
          { name, opts: { removeOnComplete: { count: 30 }, removeOnFail: { count: 30 } } },
        );
      } catch (error) {
        this.logger.error(`No se pudo programar ${name}: ${(error as Error)?.message}`);
      }
    }
  }

  async process(job: Job): Promise<PurgeResult> {
    const handler = this.jobs[job.name];
    if (!handler) {
      throw new UnrecoverableError(`Trabajo de mantenimiento no soportado: ${job.name}`);
    }
    return handler.run();
  }
}
