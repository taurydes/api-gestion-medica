import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from 'src/audit/audit.module';
import { LogsModule } from 'src/logs/logs.module';
import { QueuesModule } from 'src/queues/queues.module';
import { MaintenanceProcessor } from './maintenance.processor';

/** Hosts the `maintenance` queue worker; each feature module owns and exports its retention service. */
@Module({
  imports: [ConfigModule, QueuesModule, AuditModule, LogsModule],
  providers: [MaintenanceProcessor],
})
export class MaintenanceModule {}
