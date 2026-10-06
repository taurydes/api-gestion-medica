import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { AccessLog } from './entities/access-log.entity';
import { AccessLogInterceptor } from './access-log.interceptor';
import { AccessLogRetentionService } from './access-log-retention.service';
import { AuditController } from './audit.controller';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([AccessLog], DatabaseConnectionName.DB_MAIN)],
  controllers: [AuditController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AccessLogInterceptor },
    AccessLogRetentionService,
  ],
  exports: [AccessLogRetentionService],
})
export class AuditModule {}
