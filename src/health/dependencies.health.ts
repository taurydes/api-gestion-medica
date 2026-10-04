import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { RedisClientType } from 'redis';

const PROBE_TIMEOUT_MS = 3000;

/** Redis (sessions, cache, queues) and the AI detector, so their outage shows before a user hits it (MJ-49). */
@Injectable()
export class DependenciesHealthIndicator {
  private readonly detectorHealthUrl: string;

  constructor(
    private readonly indicator: HealthIndicatorService,
    @Inject('REDIS_SESSION_CLIENT') private readonly redis: RedisClientType,
    config: ConfigService,
  ) {
    const base = config.get<string>('DETECTOR_URL') ?? '';
    this.detectorHealthUrl = `${base.replace(/\/+$/, '')}/health`;
  }

  async redisCheck() {
    const session = this.indicator.check('redis');
    try {
      const pong = await withTimeout(this.redis.ping());
      return pong === 'PONG' ? session.up() : session.down({ message: `Respuesta inesperada: ${pong}` });
    } catch (error) {
      return session.down({ message: (error as Error).message });
    }
  }

  async detectorCheck() {
    const session = this.indicator.check('detector');
    try {
      const response = await fetch(this.detectorHealthUrl, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      return response.ok ? session.up() : session.down({ message: `HTTP ${response.status}` });
    } catch (error) {
      return session.down({ message: (error as Error).message });
    }
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS).unref()),
  ]);
}
