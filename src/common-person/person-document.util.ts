import { ConflictException } from '@nestjs/common';
import { FindOptionsWhere, IsNull, Not, Repository } from 'typeorm';
import { CommonPerson } from './entities/common-person.entity';

export const PERSON_DOCUMENT_CONFLICT =
  'El número de documento ya está registrado para otra persona.';

/** Partial unique index on persona_comun(letra, documento) (M-18). */
export const PERSON_DOCUMENT_INDEX = 'UQ_persona_comun_documento_activo';

/** Active person holding exactly this document; a missing letter matches NULL, never "any letter". */
export function personDocumentWhere(
  letter: string | null | undefined,
  documentNumber: string,
): FindOptionsWhere<CommonPerson> {
  return { letter: letter || IsNull(), documentNumber, deletedAt: IsNull() };
}

/** Rejects (409) a document change that collides with another active person; no-op if the document is unchanged. */
export async function assertDocumentAvailable(
  repo: Repository<CommonPerson>,
  current: Pick<CommonPerson, 'id' | 'letter' | 'documentNumber'>,
  patch: { letter?: string | null; documentNumber?: string | null },
): Promise<void> {
  const letter = patch.letter !== undefined ? patch.letter : current.letter;
  const documentNumber =
    patch.documentNumber !== undefined ? patch.documentNumber : current.documentNumber;
  if (!documentNumber) return;
  if (letter === current.letter && documentNumber === current.documentNumber) return;

  const clash = await repo.findOne({
    where: { ...personDocumentWhere(letter, documentNumber), id: Not(current.id) },
  });
  if (clash) throw new ConflictException(PERSON_DOCUMENT_CONFLICT);
}

/** Maps a PostgreSQL unique violation (23505, raw or inside QueryFailedError) to a domain 409; null otherwise. */
export function uniqueViolationToConflict(error: unknown): ConflictException | null {
  const e = error as any;
  const code = e?.code ?? e?.driverError?.code;
  if (code !== '23505') return null;
  const constraint = e?.constraint ?? e?.driverError?.constraint;
  return new ConflictException(
    constraint === PERSON_DOCUMENT_INDEX
      ? PERSON_DOCUMENT_CONFLICT
      : 'Ya existe un registro con esos datos.',
  );
}

/** Drops `undefined` keys so a partial patch never writes `undefined` over a loaded entity field. */
export function definedFields<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>;
}
