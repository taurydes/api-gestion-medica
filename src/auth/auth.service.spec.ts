import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { FindOperator } from 'typeorm';
import { AuthService, LOGIN_LOCKED, LOGIN_MAX_FAILURES } from './auth.service';

/** Repositorio en memoria que evalúa `where` (objeto u OR en arreglo) incluido IsNull(). */
function memoryRepo(rows: any[]) {
  const matches = (row: any, cond: Record<string, any>) =>
    Object.entries(cond).every(([key, value]) =>
      value instanceof FindOperator && value.type === 'isNull'
        ? row[key] === null || row[key] === undefined
        : row[key] === value,
    );
  return {
    findOne: jest.fn(async ({ where }: any) => {
      const conds = Array.isArray(where) ? where : [where];
      return rows.find((row) => conds.some((c) => matches(row, c))) ?? null;
    }),
  };
}

async function setup(userOverrides: Record<string, any> = {}) {
  process.env.JWT_SECRET = 'access-secret';
  process.env.JWT_REFRESH_SECRET = 'refresh-secret';
  const user = {
    id: 'u1',
    name: 'marta',
    email: 'marta@example.com',
    password: await bcrypt.hash('clave123', 4),
    roleId: 'r1',
    status: true,
    deletedAt: null,
    role: { id: 'r1', isActive: true, deletedAt: null },
    ...userOverrides,
  };
  const sessions = new Map<string, any>();
  const failures = new Map<string, number>();
  const redis = {
    // Same contract as RedisSessionService's counters, without the TTL.
    registerLoginFailure: jest.fn(async (key: string) => {
      failures.set(key, (failures.get(key) ?? 0) + 1);
      return failures.get(key)!;
    }),
    getLoginFailures: jest.fn(async (key: string) => failures.get(key) ?? 0),
    clearLoginFailures: jest.fn(async (key: string) => void failures.delete(key)),
    setSession: jest.fn(async (id: string, data: any, _ttl?: number) => sessions.set(String(id), data)),
    getSession: jest.fn(async (id: string) => sessions.get(String(id)) ?? null),
    deleteSession: jest.fn(async (id: string) => sessions.delete(String(id))),
  };
  const service = new AuthService(
    memoryRepo([user]) as any,
    memoryRepo([]) as any,
    new JwtService({}),
    redis as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, redis, sessions, user };
}

describe('AuthService — usuarios borrados o desactivados (M-05)', () => {
  it('un usuario activo inicia sesión', async () => {
    const { service } = await setup();
    await expect(
      service.login({ credential: 'marta', password: 'clave123', isSystemUser: false }),
    ).resolves.toHaveProperty('access_token');
  });

  it.each([
    { deletedAt: new Date() },
    { status: false },
    { role: { id: 'r1', isActive: false, deletedAt: null } },
    { role: { id: 'r1', isActive: true, deletedAt: new Date() } },
    { role: null },
  ])(
    'login rechazado con 401 para %o',
    async (overrides) => {
      const { service } = await setup(overrides);
      await expect(
        service.login({ credential: 'marta@example.com', password: 'clave123', isSystemUser: false }),
      ).rejects.toThrow(UnauthorizedException);
    },
  );

  it('refresh de un usuario borrado después del login → 401 y se borra la sesión', async () => {
    const { service, redis, user } = await setup();
    const { refresh_token } = await service.login({
      credential: 'marta',
      password: 'clave123',
      isSystemUser: false,
    });

    user.deletedAt = new Date() as any;
    await expect(service.refreshTokens({ refreshToken: refresh_token })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(redis.deleteSession).toHaveBeenCalledWith('u1');
  });

  it('login con rol inactivo → mismo mensaje que un usuario inactivo', async () => {
    const inactiveUser = await setup({ status: false });
    const inactiveRole = await setup({ role: { id: 'r1', isActive: false, deletedAt: null } });
    const creds = { credential: 'marta', password: 'clave123', isSystemUser: false };
    const expected = await inactiveUser.service.login(creds).catch((e) => e.message);
    await expect(inactiveRole.service.login(creds)).rejects.toThrow(expected);
  });

  it('usuario inexistente y contraseña errónea → el mismo mensaje (M-61)', async () => {
    const { service } = await setup();
    const unknown = await service
      .login({ credential: 'nadie', password: 'clave123', isSystemUser: false })
      .catch((e) => e);
    const wrongPassword = await service
      .login({ credential: 'marta', password: 'otra-clave', isSystemUser: false })
      .catch((e) => e);
    expect(unknown).toBeInstanceOf(UnauthorizedException);
    expect(unknown.message).toBe(wrongPassword.message);
  });

  it('refresh tras desactivar el rol → 401 y se borra la sesión', async () => {
    const { service, redis, user } = await setup();
    const { refresh_token } = await service.login({
      credential: 'marta',
      password: 'clave123',
      isSystemUser: false,
    });

    user.role = { id: 'r1', isActive: false, deletedAt: null };
    await expect(service.refreshTokens({ refreshToken: refresh_token })).rejects.toThrow(
      'Usuario inactivo o eliminado',
    );
    expect(redis.deleteSession).toHaveBeenCalledWith('u1');
  });
});

describe('AuthService — JWT mínimo y sesión alineada con el refresh (M-63)', () => {
  const creds = { credential: 'marta', password: 'clave123', isSystemUser: false };

  it('el JWT solo lleva id, roleId y name: sin email ni el objeto de usuario', async () => {
    const { service } = await setup();
    const { access_token, refresh_token } = await service.login(creds);

    for (const token of [access_token, refresh_token]) {
      const { iat: _i, exp: _e, ...claims } = new JwtService({}).decode(token);
      expect(claims).toEqual({ id: 'u1', roleId: 'r1', name: 'marta' });
    }
  });

  it('la sesión de Redis vive lo que el refresh (7 d), no la hora del access token', async () => {
    const { service, redis } = await setup();
    await service.login(creds);

    const ttl = redis.setSession.mock.calls[0][2];
    expect(ttl).toBeGreaterThan(7 * 24 * 3600 - 60);
    expect(ttl).toBeLessThanOrEqual(7 * 24 * 3600);
  });

  it('el refresh renueva la sesión con el mismo TTL y el payload mínimo', async () => {
    const { service, redis } = await setup();
    const { refresh_token } = await service.login(creds);

    const renewed = await service.refreshTokens({ refreshToken: refresh_token });

    expect(redis.setSession.mock.calls[1][2]).toBeGreaterThan(3600);
    const { iat: _i, exp: _e, ...claims } = new JwtService({}).decode(renewed.access_token);
    expect(claims).toEqual({ id: 'u1', roleId: 'r1', name: 'marta' });
  });
});

describe('AuthService — bloqueo por credencial tras intentos fallidos (MJ-01)', () => {
  const login = (service: AuthService, credential: string, password: string) =>
    service.login({ credential, password, isSystemUser: false });

  it('5 fallos seguidos bloquean la credencial: el 6.º intento responde 429 aunque la clave sea correcta', async () => {
    const { service, redis } = await setup();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await expect(login(service, 'marta', 'mala')).rejects.toThrow(UnauthorizedException);
    }

    await expect(login(service, 'marta', 'clave123')).rejects.toMatchObject({ status: 429, message: LOGIN_LOCKED });
    expect(redis.setSession).not.toHaveBeenCalled();
  });

  it('la credencial se normaliza: mayúsculas y espacios cuentan como la misma', async () => {
    const { service } = await setup();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await expect(login(service, i % 2 ? ' MARTA ' : 'marta', 'mala')).rejects.toThrow(UnauthorizedException);
    }
    await expect(login(service, 'Marta', 'clave123')).rejects.toMatchObject({ status: 429 });
  });

  it('un login correcto antes del límite reinicia el contador', async () => {
    const { service, redis } = await setup();
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) {
      await expect(login(service, 'marta', 'mala')).rejects.toThrow(UnauthorizedException);
    }
    await expect(login(service, 'marta', 'clave123')).resolves.toHaveProperty('access_token');

    expect(await redis.getLoginFailures('usr:marta')).toBe(0);
  });

  it('una credencial inexistente también se bloquea: el 429 no revela qué cuentas existen', async () => {
    const { service } = await setup();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await expect(login(service, 'nadie', 'x')).rejects.toThrow(UnauthorizedException);
    }
    await expect(login(service, 'nadie', 'x')).rejects.toMatchObject({ status: 429 });
  });

  it('el bloqueo de una credencial no afecta a otra', async () => {
    const { service } = await setup();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await expect(login(service, 'nadie', 'x')).rejects.toThrow(UnauthorizedException);
    }
    await expect(login(service, 'marta', 'clave123')).resolves.toHaveProperty('access_token');
  });
});
