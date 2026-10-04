import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { AccessLog } from './entities/access-log.entity';
import { AccessLogInterceptor } from './access-log.interceptor';
import { AuditController } from './audit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AccessLog], DatabaseConnectionName.DB_MAIN)],
  controllers: [AuditController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AccessLogInterceptor }],
})
export class AuditModule {}
