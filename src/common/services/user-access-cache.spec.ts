import { createCache } from 'cache-manager';
import {
  invalidateAllPermissions,
  invalidatePermissionScopes,
  roleAccessScope,
} from 'src/common/cache/permission-cache';
import { UserAccessService } from './user-access.service';

function grant(slug: string, action: string) {
  return { isActive: true, menu: { slug }, permission: { name: action, isActive: true } };
}

function setup() {
  const role = {
    id: 'role-1',
    isActive: true,
    deletedAt: null,
    permissionMenus: [grant('patient', 'consultar')],
  };
  const user = { id: 'user-1', status: true, deletedAt: null, role };
  const userRepo = {
    // Returns a copy so a cached grant list cannot alias the live row
    findOne: jest.fn(async () => structuredClone(user)),
  };
  const cache = createCache();
  const service = new UserAccessService({ findOne: async () => null } as any, userRepo as any, cache);
  const grantLoads = () =>
    userRepo.findOne.mock.calls.filter(([opts]: any) => opts.relations.length > 1).length;
  return { service, role, user, userRepo, cache, grantLoads };
}

describe('UserAccessService — grants cached per role, state always fresh (M-63)', () => {
  it('the second request reuses the role grants instead of the three-level join', async () => {
    const { service, grantLoads } = setup();

    await service.resolve('user-1');
    const second = await service.resolve('user-1');

    expect(second?.permissions).toEqual(['patient.consultar']);
    expect(grantLoads()).toBe(1);
  });

  it('a deactivated user or role is rejected at once, even with grants cached', async () => {
    const { service, user, role } = setup();
    await service.resolve('user-1');

    user.status = false;
    expect((await service.resolve('user-1'))?.isActive).toBe(false);
    user.status = true;
    role.isActive = false;
    expect((await service.resolve('user-1'))?.isActive).toBe(false);
  });

  it('a revoked grant disappears once the role scope is invalidated', async () => {
    const { service, role, cache } = setup();
    await service.resolve('user-1');

    role.permissionMenus = [];
    await invalidatePermissionScopes(cache, roleAccessScope('role-1'));

    expect((await service.resolve('user-1'))?.permissions).toEqual([]);
  });

  it('a global change (action or menu turned off) drops every role at once', async () => {
    const { service, role, cache } = setup();
    await service.resolve('user-1');

    role.permissionMenus = [grant('patient', 'consultar'), grant('recipe', 'crear')];
    await invalidateAllPermissions(cache);

    expect((await service.resolve('user-1'))?.permissions).toContain('recipe.crear');
  });
});
