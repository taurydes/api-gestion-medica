import { Cache } from 'cache-manager';

/** Permission caches (guard, role and user abilities) live one hour; grant changes invalidate them explicitly. */
export const PERMISSION_CACHE_TTL = 60 * 60_000;

const GENERATION_KEY = 'permission:generation';
// Far longer than any permission entry, so an expired generation never resurrects old keys.
const GENERATION_TTL = 30 * 24 * 60 * 60_000;

export const roleAccessScope = (roleId: string) => `access:role:${roleId}`;
export const rolePermissionsScope = (roleId: string) => `role:${roleId}:permissions`;
export const userAbilityScope = (userId: string) => `user:${userId}:ability`;

/** Key under the current generation: bumping it orphans every permission key at once. */
export async function permissionKey(cache: Cache, scope: string): Promise<string> {
  const generation = (await cache.get<number>(GENERATION_KEY)) ?? 0;
  return `permission:g${generation}:${scope}`;
}

export async function invalidatePermissionScopes(cache: Cache, ...scopes: string[]): Promise<void> {
  for (const scope of scopes) await cache.del(await permissionKey(cache, scope));
}

/** For changes that touch every role at once: a permission action or a menu turned on or off. */
export async function invalidateAllPermissions(cache: Cache): Promise<void> {
  await cache.set(GENERATION_KEY, Date.now(), GENERATION_TTL);
}
