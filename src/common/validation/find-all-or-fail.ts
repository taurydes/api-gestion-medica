import { BadRequestException } from '@nestjs/common';
import { In, IsNull, Repository } from 'typeorm';

/** Live rows for every id, or 400 naming the missing ones; never saves fewer than asked (MJ-13). */
export async function findAllOrFail<T extends { id: string }>(
  repository: Repository<T>,
  ids: string[],
  label: string,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const found = await repository.findBy({ id: In(unique), deletedAt: IsNull() } as any);
  const missing = unique.filter((id) => !found.some((row) => row.id === id));
  if (missing.length) {
    throw new BadRequestException(`${label} inexistentes: ${missing.join(', ')}.`);
  }
  return found;
}
