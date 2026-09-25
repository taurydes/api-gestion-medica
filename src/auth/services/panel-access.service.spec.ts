import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserAccessService } from 'src/common/services/user-access.service';
import { PanelAccessService } from './panel-access.service';

const SECRET = 'panel-test-secret';
const BULL_PERMISSION = 'bullboard.consultar';

function roleWith(slugs: string[], isActive = true) {
  return {
    id: 'r',
    name: 'x',
    isActive,
    deletedAt: null,
    permissionMenus: slugs.map((slug) => ({
      isActive: true,
      menu: { slug: slug.split('.')[0] },
      permission: { name: slug.split('.')[1], isActive: true },
    })),
  };
}

function build(options: { sessionOk?: boolean; role?: any; systemUser?: boolean }) {
  const jwtService = new JwtService({ secret: SECRET });
  const user = options.role
    ? { id: 'u1', status: true, deletedAt: null, role: options.role }
    : null;
  const secRepo = { findOne: jest.fn().mockResolvedValue(options.systemUser ? user : null) };
  const userRepo = { findOne: jest.fn().mockResolvedValue(options.systemUser ? null : user) };
  const redis = {
    isValidSessionToken: jest.fn().mockResolvedValue(options.sessionOk ?? false),
  };
  const config = { getOrThrow: () => SECRET };
  const service = new PanelAccessService(
    jwtService,
    redis as any,
    new UserAccessService(secRepo as any, userRepo as any),
    config as any,
  );
  const token = jwtService.sign({ id: 'u1' });
  return { service, token };
}

function fakeRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.redirect = jest.fn(() => res);
  return res;
}

describe('PanelAccessService (Bull Board y vista de logs, M-03)', () => {
  it('sin token → 401', async () => {
    const { service } = build({});
    await expect(service.authorize(undefined, BULL_PERMISSION)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('token firmado con otro secreto → 401', async () => {
    const { service } = build({ role: roleWith([BULL_PERMISSION]) });
    const forged = new JwtService({ secret: 'otro' }).sign({ id: 'u1' });
    await expect(service.authorize(forged, BULL_PERMISSION)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('token válido pero sesión Redis distinta (logout o login posterior) → 401', async () => {
    const { service, token } = build({ sessionOk: false, role: roleWith([BULL_PERMISSION]) });
    await expect(service.authorize(token, BULL_PERMISSION)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rol sin bullboard.consultar (p. ej. medico) → 403', async () => {
    const { service, token } = build({ sessionOk: true, role: roleWith(['patient.consultar']) });
    await expect(service.authorize(token, BULL_PERMISSION)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('superusuario de seguridad con bullboard.consultar entra (rol leído desde la BD)', async () => {
    const built = build({ sessionOk: true, role: roleWith([BULL_PERMISSION]), systemUser: true });
    await expect(built.service.authorize(built.token, BULL_PERMISSION)).resolves.toMatchObject({
      isSystemUser: true,
    });
  });

  it('rol inactivo → 403 aunque tenga el permiso', async () => {
    const built = build({ sessionOk: true, role: roleWith([BULL_PERMISSION], false) });
    await expect(built.service.authorize(built.token, BULL_PERMISSION)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('middleware: petición API sin token → JSON 401 y no llama a next()', async () => {
    const { service } = build({});
    const res = fakeRes();
    const next = jest.fn();
    await service.middleware(BULL_PERMISSION, '/admin/login')(
      { method: 'GET', headers: { accept: '*/*' }, cookies: {} } as any,
      res,
      next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('middleware: navegación HTML sin token → redirige al login', async () => {
    const { service } = build({});
    const res = fakeRes();
    const next = jest.fn();
    await service.middleware(BULL_PERMISSION, '/admin/login')(
      { method: 'GET', headers: { accept: 'text/html' }, cookies: {} } as any,
      res,
      next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('/admin/login?error='));
  });

  it('middleware: token de cookie válido y permiso → next()', async () => {
    const built = build({ sessionOk: true, role: roleWith([BULL_PERMISSION]), systemUser: true });
    const next = jest.fn();
    await built.service.middleware(BULL_PERMISSION, '/admin/login')(
      { method: 'GET', headers: {}, cookies: { bull_token: built.token } } as any,
      fakeRes(),
      next,
    );
    expect(next).toHaveBeenCalled();
  });
});
