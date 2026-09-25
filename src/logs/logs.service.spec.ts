import { LogsService } from './logs.service';

function setup() {
  const repo = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => x),
  };
  return { service: new LogsService(repo as any), repo };
}

describe('LogsService.create — sin credenciales en auditoria.error_log (M-07)', () => {
  it('quita Authorization, Cookie y token de los headers y enmascara el body en profundidad', async () => {
    const { service, repo } = setup();
    const headers = {
      authorization: 'Bearer eyJhbGciOi.payload.sig',
      cookie: 'access_token=eyJ...',
      token: 'abc',
      'user-agent': 'jest',
      referer: 'http://localhost/logs/ui/view?token=eyJ...&page=2',
    };

    await service.create({
      statusCode: 400,
      route: '/logs/ui/view?token=eyJabc&page=1',
      headers,
      requestQuery: { access_token: 'x', page: '1' },
      requestBody: {
        password: 'p1',
        commonPerson: { firstName: 'Ana', newPassword: 'p2' },
        items: [{ refreshToken: 'r1', qty: 1 }],
        currentPassword: 'p3',
      } as any,
      context: { params: { id: '1' }, referer: 'http://x/?token=abc' },
    });

    const saved = repo.save.mock.calls[0][0];
    expect(saved.headers).toEqual({
      'user-agent': 'jest',
      referer: 'http://localhost/logs/ui/view?token=******&page=2',
    });
    expect(saved.requestBody).toEqual({
      password: '******',
      commonPerson: { firstName: 'Ana', newPassword: '******' },
      items: [{ refreshToken: '******', qty: 1 }],
      currentPassword: '******',
    });
    expect(saved.requestQuery).toEqual({ access_token: '******', page: '1' });
    expect(saved.route).toBe('/logs/ui/view?token=******&page=1');
    expect(saved.context.referer).toBe('http://x/?token=******');
    expect(JSON.stringify(saved)).not.toMatch(/Bearer|eyJ|p1|p2|p3|r1/);
    // El request original no se modifica
    expect(headers.authorization).toContain('Bearer');
  });

  it('un body string JSON también se parsea y enmascara', async () => {
    const { service, repo } = setup();
    await service.create({ requestBody: JSON.stringify({ password: 'secreta' }) });
    expect(repo.save.mock.calls[0][0].requestBody).toEqual({ password: '******' });
  });
});
