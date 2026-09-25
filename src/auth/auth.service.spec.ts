import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { FindOperator } from 'typeorm';
import { AuthService } from './auth.service';

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
    ...userOverrides,
  };
  const sessions = new Map<string, any>();
  const redis = {
    setSession: jest.fn(async (id: string, data: any) => sessions.set(String(id), data)),
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

  it.each([{ deletedAt: new Date() }, { status: false }])(
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
});
