import { BadRequestException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { HttpExceptionFilter, INTERNAL_ERROR_MESSAGE } from './HttpExceptionFilter';
import { ParseUuid } from '../pipes/parse-uuid.pipe';

function run(exception: unknown) {
  const logs = { create: jest.fn().mockResolvedValue(undefined) };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const req = { url: '/files/appointment-files', method: 'GET', headers: {}, query: {}, body: {}, params: {} };
  const host: any = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  };
  return { logs, res, done: new HttpExceptionFilter(logs as any).catch(exception, host) };
}

describe('HttpExceptionFilter — no raw DB messages to the client (M-08)', () => {
  it('QueryFailedError → generic 500, driver detail only in the log', async () => {
    const driverMsg = 'invalid input syntax for type uuid: "../../etc"';
    const { logs, res, done } = run(new QueryFailedError('SELECT 1', [], new Error(driverMsg)));
    await done;
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ data: null, error: INTERNAL_ERROR_MESSAGE, statusCode: 500 });
    expect(logs.create).toHaveBeenCalledWith(expect.objectContaining({ message: driverMsg }));
  });

  it('HttpException keeps its own message and status', async () => {
    const { res, done } = run(new BadRequestException('Dato inválido'));
    await done;
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Dato inválido' }));
  });
});

/** Shape of body-parser's errors (http-errors): plain Error with status/type/expose. */
function bodyParserError(message: string, status: number, type: string) {
  return Object.assign(new Error(message), { status, statusCode: status, type, expose: true });
}

describe('HttpExceptionFilter — body-parser errors (H-01)', () => {
  it('PayloadTooLargeError (entity.too.large) → 413 with the Spanish limit message', async () => {
    const { res, logs, done } = run(bodyParserError('request entity too large', 413, 'entity.too.large'));
    await done;
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      data: null,
      error: 'El cuerpo de la solicitud supera el tamaño máximo permitido (30 MB).',
      statusCode: 413,
    });
    expect(logs.create).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 413 }));
  });

  it('malformed JSON (entity.parse.failed) → 400, not 500', async () => {
    const { res, done } = run(bodyParserError('Unexpected token', 400, 'entity.parse.failed'));
    await done;
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'El cuerpo de la solicitud no es un JSON válido.' }),
    );
  });

  it('a plain Error without an exposed status stays a generic 500', async () => {
    const { res, done } = run(Object.assign(new Error('boom'), { status: 503 }));
    await done;
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('ParseUuid pipe (M-08)', () => {
  const meta = { type: 'query', data: 'appointmentId' } as any;

  it('rejects a non-UUID with 400', async () => {
    await expect(ParseUuid.transform('../../etc', meta)).rejects.toThrow(BadRequestException);
  });

  it('rejects a missing id with 400', async () => {
    await expect(ParseUuid.transform(undefined as any, meta)).rejects.toThrow(BadRequestException);
  });

  it('accepts a UUID unchanged', async () => {
    const id = 'a1000000-0000-4000-8000-000000000007';
    await expect(ParseUuid.transform(id, meta)).resolves.toBe(id);
  });
});
