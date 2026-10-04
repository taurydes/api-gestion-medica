import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TerminusModule } from '@nestjs/terminus';
import { ConfigModule } from '@nestjs/config';
import { DependenciesHealthIndicator } from './dependencies.health';

@Module({
  imports: [TerminusModule, ConfigModule],
  controllers: [HealthController],
  providers: [DependenciesHealthIndicator],
})
export class HealthModule {}
