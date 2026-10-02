import { Cache } from 'cache-manager';

/** cache-manager v7 reads every TTL in milliseconds. */
export const CACHE_TTL = {
  LIST: 5 * 60_000,
  DETAIL: 10 * 60_000,
  // Outlives every entry it tracks, so no tracked key is orphaned before it expires.
  REGISTRY: 15 * 60_000,
} as const;

/** Registry of every cached appointment view (lists and details); other modules clear it when they change embedded data. */
export const APPOINTMENT_CACHE_REGISTRY = 'appointment:query:keys';

/** Caches `value` under `key` and records the key in `registry` so `clearRegistry` can drop it later. */
export async function cacheAndRemember(
  cache: Cache,
  registry: string,
  key: string,
  value: unknown,
  ttl: number,
): Promise<void> {
  await cache.set(key, value, ttl);
  const keys = (await cache.get<string[]>(registry)) ?? [];
  if (!keys.includes(key)) keys.push(key);
  await cache.set(registry, keys, CACHE_TTL.REGISTRY);
}

/** Deletes every key recorded in `registry`, then the registry itself. */
export async function clearRegistry(cache: Cache, registry: string): Promise<void> {
  const keys = (await cache.get<string[]>(registry)) ?? [];
  for (const key of keys) await cache.del(key);
  await cache.del(registry);
}
