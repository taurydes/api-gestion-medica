import { ValidationPipe } from '@nestjs/common';
import { FakeRepo } from '../../../test/in-memory-db';
import { UpdatePermissionDto } from '../dto/update-permission.dto';
import { PermissionService } from './permission.service';

const ROLE_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const ROLE_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const MENU = { id: 'menu-patient', slug: 'patient', isActive: true };
const CONSULTAR = { id: 'perm-consultar', name: 'consultar', isActive: true };
const ACTOR = { id: 'actor-1' } as any;

function grant(overrides: Record<string, any>) {
  return {
    roleId: ROLE_A,
    menuId: MENU.id,
    permissionId: CONSULTAR.id,
    isActive: true,
    deletedAt: null,
    updatedAt: null,
    userId: 'seed',
    menu: MENU,
    permission: CONSULTAR,
    ...overrides,
  };
}

function build(grants: Record<string, any>[]) {
  const cacheStore = new Map<string, unknown>();
  const cache = {
    get: jest.fn(async (k: string) => cacheStore.get(k)),
    set: jest.fn(async (k: string, v: unknown) => void cacheStore.set(k, v)),
    del: jest.fn(async (k: string) => void cacheStore.delete(k)),
  };
  const service = new PermissionService(
    new FakeRepo([]) as any,
    new FakeRepo([{ id: ROLE_A }, { id: ROLE_B }]) as any,
    new FakeRepo([CONSULTAR]) as any,
    new FakeRepo([MENU]) as any,
    new FakeRepo(grants) as any,
    new FakeRepo([]) as any,
    cache as any,
  );
  return { service, grants };
}

describe('PermissionService: asignaciones por rol con UUID (M-27)', () => {
  it('assign reactiva la fila revocada y le limpia deleted_at', async () => {
    const revoked = grant({ id: 'g1', isActive: false, deletedAt: new Date('2026-01-01') });
    const { service, grants } = build([revoked]);

    await service.assignPermissionToRole({ roleId: ROLE_A, menuSlug: 'patient', action: 'consultar' }, ACTOR);

    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ id: 'g1', isActive: true, deletedAt: null, userId: 'actor-1' });
  });

  it('assign con una fila viva y otra revocada no crea ni toca nada', async () => {
    const { service, grants } = build([
      grant({ id: 'old', isActive: false, deletedAt: new Date('2026-01-01') }),
      grant({ id: 'live' }),
    ]);

    const result = await service.assignPermissionToRole(
      { roleId: ROLE_A, menuSlug: 'patient', action: 'consultar' },
      ACTOR,
    );

    expect(result.id).toBe('live');
    expect(grants).toHaveLength(2);
    expect(grants.find((g) => g.id === 'old')).toMatchObject({ isActive: false });
  });

  it('revoke desactiva la fila viva aunque exista una revocada anterior', async () => {
    const { service, grants } = build([
      grant({ id: 'old', isActive: false, deletedAt: new Date('2026-01-01') }),
      grant({ id: 'live' }),
    ]);

    await expect(
      service.revokePermissionFromRole({ roleId: ROLE_A, menuSlug: 'patient', action: 'consultar' }),
    ).resolves.toBe(true);

    const live = grants.find((g) => g.id === 'live')!;
    expect(live.isActive).toBe(false);
    expect(live.deletedAt).toBeInstanceOf(Date);
  });

  it('revoke sin fila viva responde false', async () => {
    const { service } = build([grant({ id: 'old', isActive: false, deletedAt: new Date() })]);

    await expect(
      service.revokePermissionFromRole({ roleId: ROLE_A, menuSlug: 'patient', action: 'consultar' }),
    ).resolves.toBe(false);
  });

  it('bulkUpdate con roleId UUID asigna y revoca por slug', async () => {
    const { service, grants } = build([grant({ id: 'live' })]);

    await service.bulkUpdateRolePermissions(
      { roleId: ROLE_B, permissions: [{ module: 'patient', action: 'consultar', enabled: true }] },
      ACTOR,
    );
    await service.bulkUpdateRolePermissions(
      { roleId: ROLE_A, permissions: [{ module: 'patient', action: 'consultar', enabled: false }] },
      ACTOR,
    );

    expect(grants.find((g) => g.roleId === ROLE_B)).toMatchObject({ isActive: true, userId: 'actor-1' });
    expect(grants.find((g) => g.id === 'live')).toMatchObject({ isActive: false });
  });

  it('la caché de permisos por rol no se comparte entre roles UUID', async () => {
    const { service } = build([grant({ id: 'a' })]);

    await expect(service.getRolePermissions(ROLE_A)).resolves.toHaveLength(1);
    await expect(service.getRolePermissions(ROLE_B)).resolves.toHaveLength(0);
  });
});

describe('PATCH /permissions/:id devuelve el permiso completo (H-04)', () => {
  it('con solo displayName responde isActive, isRequired, order y controlType reales', async () => {
    const stored = {
      id: 'perm-x', name: 'exportar', displayName: 'Exportar', userId: 'seed', isActive: true,
      isRequired: true, order: 7, controlType: 'checkbox', deletedAt: null, updatedAt: null,
    };
    const permissionRepo = new FakeRepo([stored]);
    const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    const service = new PermissionService(
      new FakeRepo([]) as any, new FakeRepo([]) as any, permissionRepo as any,
      new FakeRepo([]) as any, new FakeRepo([]) as any, new FakeRepo([]) as any, cache as any,
    );
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const dto = await pipe.transform({ displayName: 'Exportar QA' }, { type: 'body', metatype: UpdatePermissionDto });

    const out = await service.update('perm-x', dto);

    expect(out).toMatchObject({ displayName: 'Exportar QA', isActive: true, isRequired: true, order: 7, controlType: 'checkbox' });
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ isActive: true, isRequired: true }), expect.anything());
  });
});
