import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Throttle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { DataSource } from 'typeorm';
import { Public } from 'src/auth/decorators/public.decorator';
import { DependenciesHealthIndicator } from './dependencies.health';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    @InjectDataSource(DatabaseConnectionName.DB_MAIN)
    private readonly mainDs: DataSource,
    private readonly dependencies: DependenciesHealthIndicator,
  ) {}

  // Monitors and the compose healthcheck call it without a token
  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check de la API' })
  @ApiResponse({ status: 200, description: 'Estado de salud OK.' })
  async check() {
    try {
      return await this.health.check([
        async () => this.db.pingCheck('database', { connection: this.mainDs }),
        async () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
        async () => this.dependencies.redisCheck(),
        async () => this.dependencies.detectorCheck(),
      ]);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      // Terminus throws its result without a message; name the failing indicators so the client knows what is down.
      const result = error.getResponse() as Record<string, any>;
      const down = Object.keys(result?.error ?? {}).sort();
      throw new ServiceUnavailableException({ ...result, message: `Servicio no disponible: ${down.join(', ')}` });
    }
  }
}
