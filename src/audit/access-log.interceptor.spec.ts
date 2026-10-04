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
  ])('%s %s → recorded', (method, url, params, expected) => {
    expect(describeAccess(method, url, params as any)).toMatchObject(expected);
  });

  it.each([
    ['GET', '/departments'],
    ['GET', '/files/profile-photos/u1/x.webp'],
    ['GET', '/patientes'],
    ['POST', '/auth/login'],
    ['POST', '/auth/refresh'],
  ])('%s %s → not recorded', (method, url) => {
    expect(describeAccess(method, url)).toBeNull();
  });
});

function context(method: string, url: string, statusCode = 200) {
  const req = { method, originalUrl: url, params: {}, user: { id: 'user-a' }, ip: '10.0.0.7' };
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
