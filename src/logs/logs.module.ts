import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { ErrorLog } from './entities/error-log.entity';
import { ErrorLogRetentionService } from './error-log-retention.service';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ErrorLog], DatabaseConnectionName.DB_MAIN),
    AuthModule,
    ConfigModule,
  ],
  controllers: [LogsController],
  providers: [LogsService, ErrorLogRetentionService],
  exports: [LogsService, ErrorLogRetentionService],
})
export class LogsModule {}
