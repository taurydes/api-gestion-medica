import { HealthIndicatorService } from '@nestjs/terminus';
import { DependenciesHealthIndicator } from './dependencies.health';

function build(redis: { ping: () => Promise<string> }) {
  const config = { get: (k: string) => (k === 'DETECTOR_URL' ? 'http://machine-learning:8501/' : undefined) };
  return new DependenciesHealthIndicator(new HealthIndicatorService(), redis as any, config as any);
}

describe('/health also probes Redis and the detector (MJ-49)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    (global as any).fetch = originalFetch;
  });

  it('Redis answering PONG → up; failing → down with the reason', async () => {
    await expect(build({ ping: async () => 'PONG' }).redisCheck()).resolves.toEqual({ redis: { status: 'up' } });
    await expect(build({ ping: async () => Promise.reject(new Error('ECONNREFUSED')) }).redisCheck()).resolves.toEqual({
      redis: { status: 'down', message: 'ECONNREFUSED' },
    });
  });

  it('detector /health 200 → up, 503 → down, unreachable → down', async () => {
    const fetchFn = jest.fn().mockResolvedValueOnce({ ok: true, status: 200 }).mockResolvedValueOnce({ ok: false, status: 503 })
      .mockRejectedValueOnce(new Error('fetch failed'));
    (global as any).fetch = fetchFn;
    const indicator = build({ ping: async () => 'PONG' });

    await expect(indicator.detectorCheck()).resolves.toEqual({ detector: { status: 'up' } });
    await expect(indicator.detectorCheck()).resolves.toEqual({ detector: { status: 'down', message: 'HTTP 503' } });
    await expect(indicator.detectorCheck()).resolves.toEqual({ detector: { status: 'down', message: 'fetch failed' } });
    expect(fetchFn.mock.calls[0][0]).toBe('http://machine-learning:8501/health');
  });
});
