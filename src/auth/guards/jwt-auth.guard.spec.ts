import { ExecutionContext, HttpException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'jwt-auth-guard-spec-secret';

function contextWith(headers: Record<string, string>) {
  const request: any = { headers };
  const ctx = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

function thrown(fn: () => unknown): HttpException {
  try {
    fn();
  } catch (e) {
    return e as HttpException;
  }
  throw new Error('expected the guard to throw');
}

describe('JwtAuthGuard (M-29: 401 para autenticación, 403 solo para permisos)', () => {
  const jwtService = new JwtService();
  const guard = new JwtAuthGuard(jwtService, new Reflector());
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });
  afterAll(() => {
    process.env.JWT_SECRET = previousSecret;
  });

  it('sin token → 401 con el mensaje "Token requerido para esta petición"', () => {
    const error = thrown(() => guard.canActivate(contextWith({}).ctx));

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getStatus()).toBe(401);
    expect(error.message).toBe('Token requerido para esta petición');
  });

  it('token firmado con otro secreto → 401', () => {
    const token = jwtService.sign({ id: 'u-1' }, { secret: 'otro-secreto' });
    const error = thrown(() =>
      guard.canActivate(contextWith({ authorization: `Bearer ${token}` }).ctx),
    );

    expect(error.getStatus()).toBe(401);
  });

  it('token mal formado → 401', () => {
    const error = thrown(() =>
      guard.canActivate(contextWith({ authorization: 'Bearer no-es-un-jwt' }).ctx),
    );

    expect(error.getStatus()).toBe(401);
  });

  it('token válido (header o cookie) → pasa y publica el payload en req.user', () => {
    const token = jwtService.sign({ id: 'u-1' }, { secret: SECRET });

    const fromHeader = contextWith({ authorization: `Bearer ${token}` });
    expect(guard.canActivate(fromHeader.ctx)).toBe(true);
    expect(fromHeader.request.user.id).toBe('u-1');

    const fromCookie = contextWith({ cookie: `access_token=${token}` });
    expect(guard.canActivate(fromCookie.ctx)).toBe(true);
    expect(fromCookie.request.accessToken).toBe(token);
  });
});
