import { BadRequestException } from '@nestjs/common';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { UserMedicalCenter } from './entities/user-medical-center.entity';

/** Live centers linked to a user through users_medical_centers (deleted centers excluded). */
export async function findUserCenters(
  repo: Repository<UserMedicalCenter>,
  userId: string,
): Promise<MedicalCenter[]> {
  const links = await repo.find({
    where: { userId, deletedAt: IsNull(), medicalCenter: { deletedAt: IsNull() } },
    relations: { medicalCenter: true },
    order: { createdAt: 'ASC' },
  });
  return links.map((link) => link.medicalCenter);
}

/** Replaces the user's center set: soft-deletes the ones left out and links the new ones. */
export async function replaceUserCenters(
  manager: EntityManager,
  userId: string,
  centerIds: string[],
  actorId: string | null,
): Promise<void> {
  const wanted = [...new Set(centerIds)];
  if (wanted.length > 0) {
    const found = await manager
      .getRepository(MedicalCenter)
      .findBy({ id: In(wanted), deletedAt: IsNull() });
    if (found.length !== wanted.length) {
      throw new BadRequestException('Uno o más centros médicos no existen.');
    }
  }

  const repo = manager.getRepository(UserMedicalCenter);
  const current = await repo.find({ where: { userId, deletedAt: IsNull() } });
  const toRemove = current.filter((link) => !wanted.includes(link.medicalCenterId));
  if (toRemove.length > 0) {
    await repo.update({ id: In(toRemove.map((link) => link.id)) }, { deletedAt: new Date() });
  }

  const kept = new Set(current.map((link) => link.medicalCenterId));
  const toAdd = wanted.filter((id) => !kept.has(id));
  if (toAdd.length > 0) {
    await repo.save(
      toAdd.map((medicalCenterId) => repo.create({ userId, medicalCenterId, createdBy: actorId })),
    );
  }
}
