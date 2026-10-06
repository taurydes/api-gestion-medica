import { Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

function response() {
  const res: any = {};
  res.clearCookie = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('AuthController.logout', () => {
  const authService = { logout: jest.fn(async () => undefined) };
  const controller = new AuthController(authService as any);

  beforeEach(() => authService.logout.mockClear());

  it('is public, so an expired access token still reaches the handler', () => {
    expect(
      new Reflector().get(IS_PUBLIC_KEY, AuthController.prototype.logout),
    ).toBe(true);
  });

  it('passes the Bearer token and the body refresh token, clears the cookie and answers success', async () => {
    const res = response();
    const req: any = { headers: { authorization: 'Bearer abc.def.ghi' } };

    await controller.logout(req, { refreshToken: 'r.t.k' }, res);

    expect(authService.logout).toHaveBeenCalledWith('abc.def.ghi', 'r.t.k');
    expect(res.clearCookie).toHaveBeenCalledWith('access_token');
    expect(res.json).toHaveBeenCalledWith({
      message: 'Sesión cerrada correctamente',
    });
  });

  it('falls back to the access_token cookie and still succeeds without any token', async () => {
    const withCookie = response();
    await controller.logout(
      { headers: { cookie: 'x=1; access_token=c.o.k' } } as any,
      {},
      withCookie,
    );
    expect(authService.logout).toHaveBeenLastCalledWith('c.o.k', undefined);

    const anonymous = response();
    await controller.logout({ headers: {} } as any, {}, anonymous);
    expect(authService.logout).toHaveBeenLastCalledWith(null, undefined);
    expect(anonymous.json).toHaveBeenCalledWith({
      message: 'Sesión cerrada correctamente',
    });
  });
});
