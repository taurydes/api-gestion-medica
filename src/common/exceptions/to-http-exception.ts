import {
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { uniqueViolationToConflict } from 'src/common-person/person-document.util';

const logger = new Logger('ServiceError');

/** Rethrows HttpExceptions as-is; any other error becomes a domain 409 or a generic 500, detail only in the log. */
export function toHttpException(error: unknown, message: string): HttpException {
  if (error instanceof HttpException) return error;
  const conflict = uniqueViolationToConflict(error);
  if (conflict) return conflict;
  const e = error as any;
  if ((e?.code ?? e?.driverError?.code) === '23503') {
    return new ConflictException('El registro está referenciado por otros datos.');
  }
  logger.error(`${message} ${e?.message ?? String(error)}`, e?.stack);
  return new InternalServerErrorException(message);
}

/** Message safe to return to the client inside a result payload (e.g. batch errors). */
export function safeErrorMessage(error: unknown): string {
  if (error instanceof HttpException) return error.message;
  const e = error as any;
  logger.error(e?.message ?? String(error), e?.stack);
  return 'Error interno.';
}
