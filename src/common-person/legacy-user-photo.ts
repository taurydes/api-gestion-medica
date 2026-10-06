import { EntityManager } from 'typeorm';
import { Patient } from 'src/patient/entities/patient.entity';
import { CommonPersonImage } from './entities/common-person-image.entity';

/** common_person_images also holds patient photos: its rows are user photos only for a person who never was a patient. */
export async function hasLegacyUserPhotos(manager: EntityManager, personId: string): Promise<boolean> {
  return (await manager.getRepository(Patient).count({ where: { commonPersonId: personId } })) === 0;
}

/** Removing a user photo also retires its legacy rows, so no older image shows up in its place. */
export async function deactivateLegacyUserPhotos(manager: EntityManager, personId: string): Promise<void> {
  if (!(await hasLegacyUserPhotos(manager, personId))) return;
  await manager
    .getRepository(CommonPersonImage)
    .update({ commonPersonId: personId, isActive: true }, { isActive: false });
}
