import { randomUUID } from 'crypto';
import { Cache } from 'cache-manager';

/** cache-manager v7 reads every TTL in milliseconds. */
export const CACHE_TTL = {
  LIST: 5 * 60_000,
  DETAIL: 10 * 60_000,
} as const;

// Far longer than any entry, so an expired generation never brings old keys back.
const GENERATION_TTL = 30 * 24 * 60 * 60_000;

/** Scope of every cached appointment view (lists and details); modules whose data they embed invalidate it too. */
export const APPOINTMENT_CACHE_SCOPE = 'appointment';

const generationKey = (scope: string) => `${scope}:generation`;

/** `key` under the scope's current generation: invalidating the scope orphans every older entry at once. */
export async function scopedKey(cache: Cache, scope: string, key: string): Promise<string> {
  const generation = (await cache.get<string>(generationKey(scope))) ?? '0';
  return `${key}#${generation}`;
}

export async function getScoped<T>(cache: Cache, scope: string, key: string): Promise<T | undefined> {
  return (await cache.get<T>(await scopedKey(cache, scope, key))) ?? undefined;
}

export async function setScoped(
  cache: Cache,
  scope: string,
  key: string,
  value: unknown,
  ttl: number,
): Promise<void> {
  await cache.set(await scopedKey(cache, scope, key), value, ttl);
}

/** One write, no read-modify-write: concurrent readers and writers cannot lose an invalidation. */
export async function invalidateScope(cache: Cache, scope: string): Promise<void> {
  await cache.set(generationKey(scope), randomUUID(), GENERATION_TTL);
}
