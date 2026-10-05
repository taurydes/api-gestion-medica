import { ConflictException } from '@nestjs/common';
import { FakeRepo } from '../../../test/in-memory-db';
import { MenuTree } from '../casl.types';
import { PermissionService } from './permission.service';

const MEDICO = 'role-medico';
const ENFERMERO = 'role-enfermero';
const SUPER = 'role-super';

// Same tree shape as seguridad.menu: Inicio and two groups, Doctores nested under Departamentos.
const menu = (id: string, parentId: string | null = null, extra: Record<string, any> = {}) => ({
  id, slug: id, name: id, parentId, url: '#', icon: null, order: 0, isActive: true, isVisible: true, ...extra,
});
const MENUS = [
  menu('menu'),
  menu('security'),
  menu('user', 'security'),
  menu('role', 'security'),
  menu('permission', 'security'),
  menu('medical-center'),
  menu('departments', 'medical-center'),
  menu('doctors', 'departments'),
  menu('patient', 'medical-center'),
  menu('recipe', 'medical-center'),
  menu('logs'),
  menu('bullboard', null, { isVisible: false }),
];

const ACTIONS = ['crear', 'consultar', 'actualizar', 'eliminar', 'module'];
const PERMISSIONS = ACTIONS.map((name) => ({ id: `perm-${name}`, name, isActive: true }));

function grant(roleId: string, menuId: string, action: string, extra: Record<string, any> = {}) {
  const permission = PERMISSIONS.find((p) => p.name === action)!;
  return {
    id: `${roleId}:${menuId}:${action}`, roleId, menuId, permissionId: permission.id, isActive: true, deletedAt: null,
    menu: MENUS.find((m) => m.id === menuId), permission, ...extra,
  };
}

const USERS = [
  { id: 'u-medico', roleId: MEDICO, role: { id: MEDICO, name: 'medico' } },
  { id: 'u-enfermero', roleId: ENFERMERO, role: { id: ENFERMERO, name: 'enfermero' } },
  { id: 'u-super', roleId: SUPER, role: { id: SUPER, name: 'superusuario' } },
];

function build(grants: Record<string, any>[], permissions = PERMISSIONS) {
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  return new PermissionService(
    new FakeRepo([]) as any,
    new FakeRepo([]) as any,
    new FakeRepo(permissions.map((p) => ({ ...p }))) as any,
    new FakeRepo(MENUS) as any,
    new FakeRepo(grants) as any,
    new FakeRepo(USERS) as any,
    cache as any,
  );
}

/** Flattens the tree into the slugs the sidebar would print. */
const slugs = (tree: MenuTree[]): string[] => tree.flatMap((m) => [m.slug, ...slugs(m.submenu)]);

describe('Sidebar menus follow `<slug>.module`, not the CRUD grants', () => {
  it('medico with role.consultar but no role.module does not see Roles nor the Seguridad group', async () => {
    const service = build([
      grant(MEDICO, 'role', 'consultar'),
      grant(MEDICO, 'doctors', 'consultar'),
      grant(MEDICO, 'menu', 'module'),
      grant(MEDICO, 'medical-center', 'module'),
      grant(MEDICO, 'departments', 'module'),
      grant(MEDICO, 'patient', 'module'),
      grant(MEDICO, 'recipe', 'module'),
    ]);

    const visible = slugs(await service.getMenusForUserAndRole('u-medico'));

    expect(visible).toEqual(['menu', 'medical-center', 'departments', 'patient', 'recipe']);
    expect(visible).not.toEqual(expect.arrayContaining(['security']));
    for (const hidden of ['security', 'role', 'user', 'permission', 'doctors', 'logs']) {
      expect(visible).not.toContain(hidden);
    }
  });

  it('a child grant alone brings its parent group along', async () => {
    const service = build([grant(ENFERMERO, 'patient', 'module')]);

    const tree = await service.getMenusForUserAndRole('u-enfermero');

    expect(tree.map((m) => m.slug)).toEqual(['medical-center']);
    expect(tree[0].submenu.map((m) => m.slug)).toEqual(['patient']);
  });

  it('superusuario with module on every menu sees every visible menu (hidden ones stay hidden)', async () => {
    const service = build(MENUS.map((m) => grant(SUPER, m.id, 'module')));

    const visible = slugs(await service.getMenusForUserAndRole('u-super'));

    expect(visible.sort()).toEqual(MENUS.filter((m) => m.isVisible).map((m) => m.id).sort());
  });

  it('a revoked module grant hides the menu again', async () => {
    const service = build([grant(ENFERMERO, 'patient', 'module', { isActive: false, deletedAt: new Date() })]);

    await expect(service.getMenusForUserAndRole('u-enfermero')).resolves.toEqual([]);
  });

  it('the module grant still reaches the flat permission list (guards ignore it, the UI can read it)', async () => {
    const service = build([grant(ENFERMERO, 'patient', 'module'), grant(ENFERMERO, 'patient', 'consultar')]);

    const { permissions } = await service.getUserPermissions('u-enfermero');

    expect(permissions.sort()).toEqual(['patient.consultar', 'patient.module']);
  });
});

describe('`module` is a system action', () => {
  it.each([
    ['delete', (s: PermissionService) => s.remove('perm-module')],
    ['deactivate', (s: PermissionService) => s.update('perm-module', { isActive: false })],
  ])('cannot %s it', async (_label, act) => {
    const service = build([]);
    await expect(act(service)).rejects.toThrow(ConflictException);
  });
});
