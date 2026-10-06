import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { RedisClientType } from 'redis';

export interface PurgeResult {
  skipped: boolean;
  deleted: number;
  retentionDays: number;
}

/** Days from a *_RETENTION_DAYS value; `fallback` when unset, null when set but not an integer >= 1. */
export function parseRetentionDays(raw: unknown, fallback: number): number | null {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/** Parsed retention days; an invalid value logs a warning and returns `fallback` instead of blocking boot. */
export function resolveRetentionDays(raw: unknown, envKey: string, fallback: number, logger: Logger): number {
  const parsed = parseRetentionDays(raw, fallback);
  if (parsed === null) {
    logger.warn(`${envKey}="${raw}" no es un entero >= 1; se usan ${fallback} días.`);
  }
  return parsed ?? fallback;
}

// Deletes only when the lock still holds our token, so an expired lock never frees another instance's run.
const RELEASE_LOCK = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/** Runs `fn` under a Redis `SET NX EX` lock; returns `{ acquired: false }` when another instance holds it. */
export async function withRedisLock<T>(
  redis: RedisClientType,
  key: string,
  ttlSeconds: number,
  logger: Logger,
  fn: () => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  const token = randomUUID();
  const acquired = await redis.set(key, token, { NX: true, EX: ttlSeconds });
  if (acquired !== 'OK') return { acquired: false };

  try {
    return { acquired: true, value: await fn() };
  } finally {
    await redis
      .eval(RELEASE_LOCK, { keys: [key], arguments: [token] })
      .catch((err) => logger.warn(`No se pudo liberar el lock ${key}: ${err?.message ?? err}`));
  }
}
