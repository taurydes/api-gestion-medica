import { ConflictException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { safeErrorMessage, toHttpException } from './to-http-exception';

const dbError = (code: string, message: string) =>
  new QueryFailedError('SELECT 1', [], Object.assign(new Error(message), { code }));

describe('toHttpException — no driver text in client errors', () => {
  it('rethrows an HttpException unchanged', () => {
    const forbidden = new ForbiddenException('No tiene acceso a este paciente.');
    expect(toHttpException(forbidden, 'Error al obtener el paciente.')).toBe(forbidden);
  });

  it('maps an unknown DB error to a generic 500 with the domain message only', () => {
    const result = toHttpException(dbError('22P02', 'invalid input syntax for type uuid'), 'Error al obtener el paciente.');
    expect(result).toBeInstanceOf(InternalServerErrorException);
    expect(result.message).toBe('Error al obtener el paciente.');
  });

  it('maps unique and FK violations to 409 without the constraint text', () => {
    expect(toHttpException(dbError('23505', 'duplicate key UQ_x'), 'x')).toBeInstanceOf(ConflictException);
    const fk = toHttpException(dbError('23503', 'violates FK_y'), 'x');
    expect(fk).toBeInstanceOf(ConflictException);
    expect(fk.message).not.toContain('FK_y');
  });

  it('safeErrorMessage hides non-HTTP detail', () => {
    expect(safeErrorMessage(new Error('relation "x" does not exist'))).toBe('Error interno.');
    expect(safeErrorMessage(new ForbiddenException('Sin permiso'))).toBe('Sin permiso');
  });
});
