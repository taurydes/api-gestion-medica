import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserAccessService } from 'src/common/services/user-access.service';
import { DashboardController } from 'src/dashboard/dashboard.controller';
import { FilesController } from 'src/files/files.controller';
import { LogsController } from 'src/logs/logs.controller';
import { SpecialtyController } from 'src/parameters/controllers/specialty.controller';
import { RecipeController } from 'src/recipe/recipe.controller';
import { UserSecurityController } from 'src/user/user-security.controller';
import { PermissionsGuard } from './permission.guard';

type Grant = [slug: string, action: string, active?: boolean];

function buildRole(grants: Grant[], overrides: Record<string, any> = {}) {
  return {
    id: 'role-1',
    name: 'medico',
    isActive: true,
    deletedAt: null,
    permissionMenus: grants.map(([slug, action, active = true]) => ({
      isActive: active,
      menu: { slug },
      permission: { name: action, isActive: true },
    })),
    ...overrides,
  };
}

function buildUser(role: any, overrides: Record<string, any> = {}) {
  return { id: 'user-1', status: true, deletedAt: null, role, ...overrides };
}

function repoReturning(value: any) {
  return { findOne: jest.fn().mockResolvedValue(value) };
}

function contextFor(controller: any, method: string, user: any = { id: 'user-1' }) {
  const request: any = { user };
  const ctx = {
    getHandler: () => controller.prototype[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

function guardFor(publicUser: any, systemUser: any = null) {
  const access = new UserAccessService(
    repoReturning(systemUser) as any,
    repoReturning(publicUser) as any,
  );
  return new PermissionsGuard(new Reflector(), access);
}

describe('PermissionsGuard (con UserAccessService real y repositorios simulados)', () => {
  it('deja pasar y publica los permisos cuando el rol activo tiene el permiso', async () => {
    const guard = guardFor(buildUser(buildRole([['parameters', 'crear']])));
    const { ctx, request } = contextFor(SpecialtyController, 'create');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.userPermissions).toEqual(['parameters.crear']);
  });

  it('rechaza con 401 si el rol está inactivo (M-05, M-29)', async () => {
    const role = buildRole([['parameters', 'crear']], { isActive: false });
    const guard = guardFor(buildUser(role));
    const { ctx } = contextFor(SpecialtyController, 'create');

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza con 401 si el usuario está borrado o desactivado (M-05, M-29)', async () => {
    const role = buildRole([['parameters', 'crear']]);
    for (const overrides of [{ deletedAt: new Date() }, { status: false }]) {
      const guard = guardFor(buildUser(role, overrides));
      const { ctx } = contextFor(SpecialtyController, 'create');
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    }
  });

  it('rechaza con 401 si no hay usuario autenticado en la request (M-29)', async () => {
    const guard = guardFor(buildUser(buildRole([['parameters', 'crear']])));
    const { ctx } = contextFor(SpecialtyController, 'create', undefined);
    (ctx.switchToHttp().getRequest() as any).user = undefined;

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza con 401 si el usuario no existe o no tiene rol (M-29)', async () => {
    const guard = guardFor(null, null);
    const { ctx } = contextFor(SpecialtyController, 'create');

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza con 403 (no 401) cuando solo falta el permiso (M-29)', async () => {
    const guard = guardFor(buildUser(buildRole([['parameters', 'consultar']])));
    const { ctx } = contextFor(SpecialtyController, 'create');

    const error = await guard.canActivate(ctx).catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getStatus()).toBe(403);
  });

  it('ignora asignaciones desactivadas en permisos_menus', async () => {
    const guard = guardFor(buildUser(buildRole([['parameters', 'crear', false]])));
    const { ctx } = contextFor(SpecialtyController, 'create');

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('usa el rol del usuario de seguridad antes que el de users', async () => {
    const sysUser = buildUser(buildRole([['logs', 'consultar']], { name: 'superusuario' }));
    const guard = guardFor(null, sysUser);
    const { ctx } = contextFor(LogsController, 'getLogsApi');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

describe('Matriz de permisos de los endpoints corregidos (M-09, M-10)', () => {
  const cases: Array<{
    name: string;
    controller: any;
    method: string;
    allowed: Grant[];
    denied: Grant[];
  }> = [
    {
      name: 'POST /specialties exige parameters.crear',
      controller: SpecialtyController,
      method: 'create',
      allowed: [['parameters', 'crear']],
      denied: [['parameters', 'consultar']],
    },
    {
      name: 'DELETE /specialties/:id exige parameters.eliminar',
      controller: SpecialtyController,
      method: 'remove',
      allowed: [['parameters', 'eliminar']],
      denied: [['parameters', 'consultar']],
    },
    {
      name: 'POST /recipes exige recipe.crear',
      controller: RecipeController,
      method: 'create',
      allowed: [['recipe', 'crear']],
      denied: [['recipe', 'consultar']],
    },
    {
      name: 'GET /logs exige logs.consultar',
      controller: LogsController,
      method: 'findAll',
      allowed: [['logs', 'consultar']],
      denied: [['logs', 'crear']],
    },
    {
      name: 'GET /logs/ui/api exige logs.consultar',
      controller: LogsController,
      method: 'getLogsApi',
      allowed: [['logs', 'consultar']],
      denied: [['patient', 'consultar']],
    },
    {
      name: 'POST /files/dicom-convert exige file.crear',
      controller: FilesController,
      method: 'convertDicom',
      allowed: [['file', 'crear']],
      denied: [['file', 'consultar']],
    },
    {
      name: 'GET /dashboard/recent-appointments exige appointments.consultar o patient.consultar (MJ-38)',
      controller: DashboardController,
      method: 'getRecentAppointments',
      allowed: [['appointments', 'consultar'], ['patient', 'consultar']],
      denied: [['recipe', 'consultar']],
    },
    {
      name: 'PATCH /users-security/:id exige user-security.actualizar',
      controller: UserSecurityController,
      method: 'update',
      allowed: [['user-security', 'actualizar']],
      denied: [['user', 'actualizar']],
    },
  ];

  it.each(cases)('$name', async ({ controller, method, allowed, denied }) => {
    const allow = guardFor(buildUser(buildRole(allowed)));
    await expect(allow.canActivate(contextFor(controller, method).ctx)).resolves.toBe(true);

    const deny = guardFor(buildUser(buildRole(denied)));
    await expect(deny.canActivate(contextFor(controller, method).ctx)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it.each(['stats', 'getRecentAppointments', 'getAppointmentsByStatus', 'getAppointmentsByMonth'])(
    'los 4 endpoints del dashboard declaran permiso (%s)',
    async (method) => {
      const deny = guardFor(buildUser(buildRole([])));
      const handler = method === 'stats' ? 'getStats' : method;
      await expect(
        deny.canActivate(contextFor(DashboardController, handler).ctx),
      ).rejects.toThrow(ForbiddenException);
    },
  );
});
