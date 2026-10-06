import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import {
  ACCESS_LOG_PURGE_CRON,
  ACCESS_LOG_PURGE_JOB,
  MAINTENANCE_QUEUE,
} from './access-log-retention.const';
import { AccessLogRetentionService, PurgeResult } from './access-log-retention.service';

/** Worker of the `maintenance` queue; registers the daily access-log purge as a BullMQ job scheduler. */
@Processor(MAINTENANCE_QUEUE)
export class AccessLogRetentionProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccessLogRetentionProcessor.name);

  constructor(
    private readonly retention: AccessLogRetentionService,
    private readonly config: ConfigService,
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    // Upsert by a fixed id is idempotent: every instance can call it and Redis keeps one schedule.
    try {
      await this.queue.upsertJobScheduler(
        ACCESS_LOG_PURGE_JOB,
        { pattern: ACCESS_LOG_PURGE_CRON, tz: this.config.get('TZ') || undefined },
        {
          name: ACCESS_LOG_PURGE_JOB,
          opts: { removeOnComplete: { count: 30 }, removeOnFail: { count: 30 } },
        },
      );
    } catch (error) {
      this.logger.error(`No se pudo programar la purga de access_log: ${(error as Error)?.message}`);
    }
  }

  async process(job: Job): Promise<PurgeResult> {
    if (job.name !== ACCESS_LOG_PURGE_JOB) {
      throw new UnrecoverableError(`Trabajo de mantenimiento no soportado: ${job.name}`);
    }
    return this.retention.purge();
  }
}
