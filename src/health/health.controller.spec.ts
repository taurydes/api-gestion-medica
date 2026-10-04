import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

/** Terminus throws the aggregated result; the controller must name what is down in the client message. */
const terminusFailure = {
  status: 'error',
  info: { database: { status: 'up' }, memory_heap: { status: 'up' }, redis: { status: 'up' } },
  error: { detector: { status: 'down', message: 'fetch failed' } },
  details: {
    database: { status: 'up' }, memory_heap: { status: 'up' }, redis: { status: 'up' },
    detector: { status: 'down', message: 'fetch failed' },
  },
};

function build(check: () => Promise<unknown>) {
  const health = { check: jest.fn(check) };
  return new HealthController(health as any, {} as any, {} as any, {} as any, {} as any);
}

describe('GET /health says which dependency is down', () => {
  it('all indicators up → the terminus result as is', async () => {
    const ok = { status: 'ok', info: {}, error: {}, details: {} };
    await expect(build(async () => ok).check()).resolves.toBe(ok);
  });

  it('one indicator down → 503 whose message names it and whose body keeps the indicator map', async () => {
    const error: ServiceUnavailableException = await build(async () => {
      throw new ServiceUnavailableException(terminusFailure);
    })
      .check()
      .catch((e) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toMatchObject({
      message: 'Servicio no disponible: detector',
      details: terminusFailure.details,
      error: terminusFailure.error,
    });
  });

  it('two indicators down → both named', async () => {
    const two = { ...terminusFailure, error: { ...terminusFailure.error, redis: { status: 'down', message: 'ECONNREFUSED' } } };
    const error: ServiceUnavailableException = await build(async () => {
      throw new ServiceUnavailableException(two);
    })
      .check()
      .catch((e) => e);
    expect((error.getResponse() as any).message).toBe('Servicio no disponible: detector, redis');
  });
});
