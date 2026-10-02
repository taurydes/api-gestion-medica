import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserAccessService } from 'src/common/services/user-access.service';
import { SpecialtyController } from 'src/parameters/controllers/specialty.controller';
import { UserController } from 'src/user/user.controller';
import { PermissionsGuard } from './permission.guard';
import { SessionGuard } from './session.guard';

function buildUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    status: true,
    deletedAt: null,
    role: {
      id: 'role-1',
      isActive: true,
      deletedAt: null,
      permissionMenus: [
        {
          isActive: true,
          menu: { slug: 'parameters' },
          permission: { name: 'crear', isActive: true },
        },
      ],
    },
    ...overrides,
  };
}

function contextFor(controller: any, method: string) {
  const request: any = { user: { id: 'user-1' }, accessToken: 'tok' };
  const ctx = {
    getHandler: () => controller.prototype[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

function setup(publicUser: any, sessionValid = true) {
  const userRepo = { findOne: jest.fn().mockResolvedValue(publicUser) };
  const secRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const access = new UserAccessService(secRepo as any, userRepo as any);
  const redis = { isValidSessionToken: jest.fn().mockResolvedValue(sessionValid) };
  const reflector = new Reflector();
  return {
    session: new SessionGuard(redis as any, reflector, access),
    permissions: new PermissionsGuard(reflector, access),
    userRepo,
  };
}

describe('SessionGuard — rechaza usuarios borrados o inactivos (C-03)', () => {
  it('deja pasar al usuario activo con sesión válida y publica su acceso', async () => {
    const { session } = setup(buildUser());
    const { ctx, request } = contextFor(UserController, 'findAll');

    await expect(session.canActivate(ctx)).resolves.toBe(true);
    expect(request.userAccess?.userId).toBe('user-1');
  });

  it.each([
    ['borrado lógico', { deletedAt: new Date() }],
    ['desactivado', { status: false }],
  ])('401 si el usuario está %s aunque la sesión siga en Redis', async (_label, overrides) => {
    const { session } = setup(buildUser(overrides));
    const { ctx } = contextFor(UserController, 'findAll');

    await expect(session.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('401 si el usuario ya no existe (borrado físico en seguridad.users)', async () => {
    const { session } = setup(null);
    const { ctx } = contextFor(UserController, 'findAll');

    await expect(session.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('401 sin consultar la BD si la sesión de Redis no es válida', async () => {
    const { session, userRepo } = setup(buildUser(), false);
    const { ctx } = contextFor(UserController, 'findAll');

    await expect(session.canActivate(ctx)).rejects.toThrow('Sesión expirada o cerrada');
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('PermissionsGuard reutiliza el acceso resuelto: una sola consulta por request', async () => {
    const { session, permissions, userRepo } = setup(buildUser());
    const { ctx } = contextFor(SpecialtyController, 'create');

    await session.canActivate(ctx);
    const afterSession = userRepo.findOne.mock.calls.length;
    await expect(permissions.canActivate(ctx)).resolves.toBe(true);
    // The guard adds no query of its own (resolve itself is one or two, depending on the grant cache)
    expect(userRepo.findOne).toHaveBeenCalledTimes(afterSession);
  });
});
