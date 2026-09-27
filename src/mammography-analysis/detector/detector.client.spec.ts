import {
  BadRequestException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { DETECTOR_MESSAGES, DetectorClient } from './detector.client';

const config = {
  get: (key: string) =>
    ({ DETECTOR_URL: 'http://detector:8501/', DETECTOR_SECRET: 's3cret', DETECTOR_TIMEOUT_MS: 30000 })[key],
};

const image = { buffer: Buffer.from([1, 2, 3]), fileName: 'm.jpg', mimeType: 'image/jpeg' };

const okBody = {
  prediction: 'MALIGNO',
  probability: 96.19,
  label: 'Neoplasia Maligna (BI-RADS 4/5)',
  status: 'danger',
  rawScore: 0.0381,
  malignancyProbability: 96.19,
  threshold: 0.15,
  modelVersion: 'resnet50v2-2025',
};

function mockFetch(impl: (...args: any[]) => any) {
  const fn = jest.fn(impl);
  (global as any).fetch = fn;
  return fn;
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('DetectorClient (M-39)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    (global as any).fetch = originalFetch;
  });

  it('sends the image with the shared secret and normalizes the result', async () => {
    const fetchFn = mockFetch(async () => jsonResponse(200, okBody));
    const result = await new DetectorClient(config as any).predict(image);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://detector:8501/predict');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Detector-Secret']).toBe('s3cret');
    expect((init.body as FormData).get('file')).toBeInstanceOf(Blob);
    expect(init.signal).toBeDefined();

    expect(result).toMatchObject({
      prediction: 'MALIGNANT',
      status: 'danger',
      probability: 96.19,
      rawScore: 0.0381,
      malignancyProbability: 96.19,
      threshold: 0.15,
      modelVersion: 'resnet50v2-2025',
    });
    expect(result.raw).toEqual(okBody);
  });

  it.each([
    [400, BadRequestException, DETECTOR_MESSAGES.corrupt],
    [413, PayloadTooLargeException, DETECTOR_MESSAGES.tooLarge],
    [415, UnsupportedMediaTypeException, DETECTOR_MESSAGES.unsupported],
    [422, UnprocessableEntityException, DETECTOR_MESSAGES.outOfDomain],
    [401, ServiceUnavailableException, DETECTOR_MESSAGES.unavailable],
    [503, ServiceUnavailableException, DETECTOR_MESSAGES.unavailable],
    [500, ServiceUnavailableException, DETECTOR_MESSAGES.unavailable],
  ])('detector %i → %p with a fixed Spanish message', async (status, type, message) => {
    mockFetch(async () => jsonResponse(status, { detail: '<_io.BytesIO object at 0x7f>' }));
    const err = await new DetectorClient(config as any).predict(image).catch((e) => e);
    expect(err).toBeInstanceOf(type);
    expect(err.message).toBe(message);
    expect(err.message).not.toContain('BytesIO');
  });

  it('detector down or timed out → 503', async () => {
    mockFetch(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(new DetectorClient(config as any).predict(image)).rejects.toThrow(
      ServiceUnavailableException,
    );

    mockFetch(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    await expect(new DetectorClient(config as any).predict(image)).rejects.toThrow(
      DETECTOR_MESSAGES.unavailable,
    );
  });

  it.each([
    ['unknown prediction', { ...okBody, prediction: 'QUIZAS' }],
    ['status that contradicts the prediction', { ...okBody, status: 'success' }],
    ['missing rawScore', { ...okBody, rawScore: undefined }],
    ['malignancyProbability out of range', { ...okBody, malignancyProbability: 140 }],
  ])('200 with %s → 503, never a made-up result', async (_label, body) => {
    mockFetch(async () => jsonResponse(200, body));
    await expect(new DetectorClient(config as any).predict(image)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
