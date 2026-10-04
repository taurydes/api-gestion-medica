import { NotFoundException } from '@nestjs/common';
import { InMemoryDb } from '../../../test/in-memory-db';
import { PermissionMenu } from '../entities/permission-menu.entity';
import { Role } from 'src/role/entities/role.entity';
import { PermissionService } from './permission.service';

const ROLE = 'aaaaaaaa-0000-4000-8000-000000000001';
const DELETED_ROLE = 'dddddddd-0000-4000-8000-000000000004';
const MENU = { id: 'menu-patient', slug: 'patient' };
const PERMS = {
  consultar: { id: 'perm-consultar', name: 'consultar', isActive: true },
  crear: { id: 'perm-crear', name: 'crear', isActive: true },
  actualizar: { id: 'perm-actualizar', name: 'actualizar', isActive: true },
};

function build(grants: Record<string, any>[]) {
  const db = new InMemoryDb()
    .table(Role, [{ id: ROLE, deletedAt: null }, { id: DELETED_ROLE, deletedAt: new Date('2026-01-01') }])
    .table(PermissionMenu, grants);
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  // The service opens its transaction through the grants repository's manager.
  const grantsRepo = Object.assign(db.repo(PermissionMenu), { manager: db.dataSource });
  const service = new PermissionService(
    {} as any, db.repo(Role), {} as any, {} as any, grantsRepo, {} as any, cache as any,
  );
  jest.spyOn(service, 'invalidateRoleCache').mockResolvedValue(undefined);
  return { service, db };
}

const live = (permission: { id: string }, extra: Record<string, any> = {}) => ({
  id: `g-${permission.id}`, roleId: ROLE, menuId: MENU.id, permissionId: permission.id, isActive: true,
  deletedAt: null, menu: MENU, permission, ...extra,
});
const assignment = (permission: { id: string }) => ({ permissionId: permission.id, submenuId: MENU.id });
const ACTOR = { id: 'admin-1' } as any;

describe('PUT matrix (assignPermissionsToRole) runs in one transaction (MJ-09)', () => {
  it('replaces the matrix: creates the new grant and revokes the dropped one', async () => {
    const { service, db } = build([live(PERMS.consultar)]);

    const result = await service.assignPermissionsToRole(
      { roleId: ROLE, assignments: [assignment(PERMS.crear)] } as any, ACTOR,
    );

    expect(result).toEqual({ created: 1, skipped: 0, deactivated: 1 });
    const active = db.rows(PermissionMenu).filter((g) => g.isActive).map((g) => g.permissionId);
    expect(active).toEqual([PERMS.crear.id]);
  });

  it('a failure on the second write leaves the previous matrix untouched', async () => {
    const { service, db } = build([live(PERMS.consultar)]);
    db.failSaves(PermissionMenu, 1, 1);

    await expect(
      service.assignPermissionsToRole(
        { roleId: ROLE, assignments: [assignment(PERMS.crear), assignment(PERMS.actualizar)] } as any, ACTOR,
      ),
    ).rejects.toThrow('simulated database failure');

    expect(db.rows(PermissionMenu)).toHaveLength(1);
    expect(db.rows(PermissionMenu)[0]).toMatchObject({ permissionId: PERMS.consultar.id, isActive: true });
  });

  it('a deleted role → 404 and nothing is written', async () => {
    const { service, db } = build([]);
    await expect(
      service.assignPermissionsToRole({ roleId: DELETED_ROLE, assignments: [assignment(PERMS.crear)] } as any, ACTOR),
    ).rejects.toThrow(NotFoundException);
    expect(db.rows(PermissionMenu)).toHaveLength(0);
  });
});

describe('GET /permissions/role/:roleId resolves by role (MJ-08)', () => {
  it('returns the live grants of the role as module/action pairs', async () => {
    const { service } = build([live(PERMS.consultar), live(PERMS.crear, { isActive: false })]);

    await expect(service.getPermissionsByRole(ROLE)).resolves.toEqual([
      { module: 'patient', action: 'consultar', permissionId: PERMS.consultar.id, menuId: MENU.id, isActive: true },
    ]);
  });

  it.each([['missing', 'ffffffff-0000-4000-8000-000000000009'], ['deleted', DELETED_ROLE]])(
    'a %s role → 404',
    async (_label, roleId) => {
      const { service } = build([]);
      await expect(service.getPermissionsByRole(roleId)).rejects.toThrow(NotFoundException);
    },
  );
});
