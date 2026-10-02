import KeyvRedis from '@keyv/redis';
import { CacheModuleOptions } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keyv } from 'keyv';

/** Redis-backed cache: cache-manager v7 only reads `stores` (Keyv) and every TTL is in milliseconds. */
export function cacheOptionsFactory(config: ConfigService): CacheModuleOptions {
  const store = new KeyvRedis({
    socket: {
      host: config.get<string>('REDIS_HOST'),
      port: Number(config.get('REDIS_PORT') ?? 6379),
    },
    password: config.get<string>('REDIS_PASSWORD') || undefined,
  });
  // No prefix: keys stay exactly as the services write them (appointment:detail:<id>)
  const keyv = new Keyv({ store, useKeyPrefix: false });
  // A listener keeps a Redis outage from surfacing as an unhandled 'error' event
  keyv.on('error', (err) => new Logger('Cache').error(`Redis cache: ${err?.message ?? err}`));
  return { stores: [keyv], ttl: Number(config.get('CACHE_TTL_MS')) };
}
