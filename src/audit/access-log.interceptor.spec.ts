import { UnauthorizedException } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AccessLogInterceptor, describeAccess } from './access-log.interceptor';
import { AuditController } from './audit.controller';

const HISTORY = '5b0f6a55-4a0e-4c1a-9f5e-0000000000aa';

describe('What the access trail records (MJ-39)', () => {
  it.each([
    ['PATCH', `/medical-history/${HISTORY}`, { id: HISTORY }, { resource: 'medical-history', resourceId: HISTORY, action: 'write' }],
    ['POST', '/permissions/role-permissions', {}, { resource: 'permissions', resourceId: null, action: 'write' }],
    ['GET', `/recipes/${HISTORY}?x=1`, { id: HISTORY }, { path: `/recipes/${HISTORY}`, resource: 'recipes', action: 'read' }],
    ['GET', `/files/appointment-files/${HISTORY}`, { fileId: HISTORY }, { resource: 'files', resourceId: HISTORY, action: 'read' }],
    ['GET', '/patient?search=Rivas', {}, { path: '/patient', resource: 'patient', action: 'read' }],
    ['GET', `/documents/jobs/${HISTORY}/file`, { jobId: HISTORY }, { resource: 'documents', resourceId: HISTORY, action: 'read' }],
  ])('%s %s → recorded', (method, url, params, expected) => {
    expect(describeAccess(method, url, params as any)).toMatchObject(expected);
  });

  it.each([
    ['GET', '/departments'],
    ['GET', '/files/profile-photos/u1/x.webp'],
    ['GET', '/patientes'],
    ['POST', '/auth/refresh'],
    ['POST', '/auth/logout'],
    ['GET', `/documents/jobs/${HISTORY}`],
  ])('%s %s → not recorded', (method, url) => {
    expect(describeAccess(method, url)).toBeNull();
  });

  it('API and Bull Board logins are recorded only when they fail, with the credential typed', () => {
    expect(describeAccess('POST', '/auth/login', {}, { credential: ' cmendoza ', password: 'x' } as any)).toEqual({
      path: '/auth/login', resource: 'auth', resourceId: 'cmendoza', action: 'login_failed', failedOnly: true,
    });
    expect(describeAccess('POST', '/admin/login', {}, { username: 'admin', password: 'x' } as any)).toMatchObject({
      resource: 'admin', resourceId: 'admin', action: 'login_failed', failedOnly: true,
    });
    expect(describeAccess('POST', '/auth/login', {}, {})).toMatchObject({ resourceId: null });
  });
});

function context(method: string, url: string, statusCode = 200, body: unknown = {}, user: unknown = { id: 'user-a' }) {
  const req = { method, originalUrl: url, params: {}, user, ip: '10.0.0.7', body };
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode }) }),
  } as any;
}

describe('AccessLogInterceptor', () => {
  it('a successful write inserts one row with user, status and ip, never the body', async () => {
    const repo = { insert: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new AccessLogInterceptor(repo as any);

    await lastValueFrom(interceptor.intercept(context('DELETE', `/recipes/${HISTORY}`, 204), { handle: () => of(null) }));

    expect(repo.insert).toHaveBeenCalledWith({
      path: `/recipes/${HISTORY}`, resource: 'recipes', resourceId: HISTORY, action: 'write',
      method: 'DELETE', userId: 'user-a', statusCode: 204, ip: '10.0.0.7',
    });
  });

  it('a failed request is not recorded here (the error log keeps it)', async () => {
    const repo = { insert: jest.fn() };
    const interceptor = new AccessLogInterceptor(repo as any);
    await expect(
      lastValueFrom(interceptor.intercept(context('PATCH', '/patient/x'), { handle: () => throwError(() => new Error('403')) })),
    ).rejects.toThrow('403');
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('a failed login inserts a row without user, with the credential and the status; the password never', async () => {
    const repo = { insert: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new AccessLogInterceptor(repo as any);
    const ctx = context('POST', '/auth/login', 200, { credential: 'cmendoza', password: 'Secreta1' }, null);

    await expect(
      lastValueFrom(interceptor.intercept(ctx, { handle: () => throwError(() => new UnauthorizedException('Credenciales inválidas')) })),
    ).rejects.toThrow(UnauthorizedException);

    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(repo.insert).toHaveBeenCalledWith({
      path: '/auth/login', resource: 'auth', resourceId: 'cmendoza', action: 'login_failed',
      method: 'POST', userId: null, statusCode: 401, ip: '10.0.0.7',
    });
    expect(JSON.stringify(repo.insert.mock.calls[0][0])).not.toContain('Secreta1');
  });

  it('a successful login is not recorded', async () => {
    const repo = { insert: jest.fn() };
    const interceptor = new AccessLogInterceptor(repo as any);
    const ctx = context('POST', '/auth/login', 201, { credential: 'cmendoza', password: 'x' }, null);
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of({ access_token: 't' }) }));
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('an insert failure does not fail the request', async () => {
    const repo = { insert: jest.fn().mockRejectedValue(new Error('db down')) };
    const interceptor = new AccessLogInterceptor(repo as any);
    await expect(
      lastValueFrom(interceptor.intercept(context('POST', '/medical-history'), { handle: () => of({ id: 'h1' }) })),
    ).resolves.toEqual({ id: 'h1' });
  });
});

describe('GET /audit/access-log filters and pages', () => {
  it('applies every filter and the page window, newest first', async () => {
    const calls: any[] = [];
    const qb: any = new Proxy({}, {
      get: (_t, name: string) => {
        if (name === 'then') return undefined;
        if (name === 'getManyAndCount') return async () => [[{ id: 'l1' }], 1];
        return (...args: any[]) => { calls.push([name, ...args]); return qb; };
      },
    });
    const controller = new AuditController({ createQueryBuilder: () => qb } as any);

    const out = await controller.findAll({ userId: 'u1', resource: 'recipes', action: 'write', page: 2, limit: 10 } as any);

    expect(out).toEqual({ data: [{ id: 'l1' }], total: 1, page: 2, limit: 10 });
    expect(calls).toContainEqual(['orderBy', 'log.createdAt', 'DESC']);
    expect(calls).toContainEqual(['andWhere', 'log.action = :action', { action: 'write' }]);
    expect(calls).toContainEqual(['skip', 10]);
  });
});
