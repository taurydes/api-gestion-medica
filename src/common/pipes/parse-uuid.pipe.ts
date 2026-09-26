import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/** Rejects non-UUID ids with a 400 before they reach a uuid column (Postgres would answer 500). */
export const ParseUuid = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('El identificador debe ser un UUID válido.'),
});
