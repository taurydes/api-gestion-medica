import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { APPOINTMENT_CACHE_SCOPE, invalidateScope } from 'src/common/cache/cache-registry';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { DoctorImage } from 'src/doctors/entities/doctor-image.entity';
import { User } from 'src/user/entities/user.entity';
import { FilesService } from './files.service';
import { PhotoAccessService } from './photo-access.service';

/** User photo (persona_comun.photo_url) and doctor photo (doctor_images) are separate; this optionally sets both at once. */
@Injectable()
export class ProfilePhotoSyncService {
  constructor(
    private readonly files: FilesService,
    private readonly photoAccess: PhotoAccessService,
    private readonly authContext: AuthContextService,
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Doctor, DatabaseConnectionName.DB_MAIN)
    private readonly doctorRepo: Repository<Doctor>,
    @InjectDataSource(DatabaseConnectionName.DB_MAIN)
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  /** Stores a user photo (persisted later by PATCH /auth/me); with `alsoForDoctor` it also becomes the owner's doctor photo. */
  async uploadUserPhoto(
    actorId: string,
    file: Express.Multer.File,
    ownerId: string | undefined,
    alsoForDoctor: boolean,
  ): Promise<{ url: string; doctorImageUrl?: string | null }> {
    await this.photoAccess.assertProfileOwner(actorId, ownerId);
    const owner = ownerId || actorId;
    const doctorId = alsoForDoctor ? await this.authContext.getDoctorIdForUser(owner) : null;
    if (doctorId) await this.photoAccess.assertCanSetDoctorPhoto(actorId, doctorId);

    const webp = await this.files.toPhotoWebp(file);
    const url = this.files.storeProfilePhoto(webp, owner);
    if (!alsoForDoctor) return { url };
    if (!doctorId) return { url, doctorImageUrl: null };

    const image = await this.dataSource.transaction((manager) =>
      this.replaceDoctorImage(manager, doctorId, webp, actorId, file.originalname),
    );
    await this.invalidateDoctorViews();
    return { url, doctorImageUrl: this.files.getDoctorImageUrl(image.id) };
  }

  /** Stores a doctor photo; with `alsoForUser` it also becomes the profile photo of the doctor's user account. */
  async uploadDoctorPhoto(
    actorId: string,
    file: Express.Multer.File,
    doctorId: string,
    alsoForUser: boolean,
  ): Promise<{ url: string; image: DoctorImage; userPhotoUrl?: string | null }> {
    await this.photoAccess.assertCanSetDoctorPhoto(actorId, doctorId);
    const linked = alsoForUser ? await this.linkedUser(doctorId) : null;
    if (linked) await this.photoAccess.assertProfileOwner(actorId, linked.id);

    const webp = await this.files.toPhotoWebp(file);
    const userPhotoUrl = linked ? this.files.storeProfilePhoto(webp, linked.id) : null;
    const image = await this.dataSource.transaction(async (manager) => {
      if (linked && userPhotoUrl) {
        await manager.getRepository(CommonPerson).update(linked.commonPerson.id, { photoUrl: userPhotoUrl });
      }
      return this.replaceDoctorImage(manager, doctorId, webp, actorId, file.originalname);
    });

    await this.invalidateDoctorViews();
    if (linked) await this.invalidateUser(linked.id);
    const result = { url: this.files.getDoctorImageUrl(image.id), image };
    return alsoForUser ? { ...result, userPhotoUrl } : result;
  }

  /** Clears the caller's own user photo; with `alsoForDoctor` it also deactivates their doctor photo. */
  async removeUserPhoto(
    actorId: string,
    alsoForDoctor: boolean,
  ): Promise<{ userPhotoRemoved: boolean; doctorPhotoRemoved: boolean }> {
    const user = await this.userRepo.findOne({
      where: { id: actorId, deletedAt: IsNull() },
      relations: ['commonPerson'],
    });
    const doctorId = alsoForDoctor ? await this.authContext.getDoctorIdForUser(actorId) : null;
    await this.dataSource.transaction(async (manager) => {
      if (user?.commonPerson) {
        await manager.getRepository(CommonPerson).update(user.commonPerson.id, { photoUrl: null });
      }
      if (doctorId) await this.deactivateDoctorImages(manager, doctorId);
    });
    if (doctorId) await this.invalidateDoctorViews();
    await this.invalidateUser(actorId);
    return { userPhotoRemoved: !!user?.commonPerson, doctorPhotoRemoved: !!doctorId };
  }

  /** Deactivates a doctor's photo; with `alsoForUser` it also clears the linked user's profile photo. */
  async removeDoctorPhoto(
    actorId: string,
    doctorId: string,
    alsoForUser: boolean,
  ): Promise<{ userPhotoRemoved: boolean; doctorPhotoRemoved: boolean }> {
    await this.photoAccess.assertCanSetDoctorPhoto(actorId, doctorId);
    const linked = alsoForUser ? await this.linkedUser(doctorId) : null;
    if (linked) await this.photoAccess.assertProfileOwner(actorId, linked.id);

    await this.dataSource.transaction(async (manager) => {
      await this.deactivateDoctorImages(manager, doctorId);
      if (linked) {
        await manager.getRepository(CommonPerson).update(linked.commonPerson.id, { photoUrl: null });
      }
    });
    await this.invalidateDoctorViews();
    if (linked) await this.invalidateUser(linked.id);
    return { userPhotoRemoved: !!linked, doctorPhotoRemoved: true };
  }

  /** The live user account that shares the doctor's persona_comun, if any. */
  private async linkedUser(doctorId: string): Promise<User | null> {
    const doctor = await this.doctorRepo.findOne({ where: { id: doctorId, deletedAt: IsNull() } });
    if (!doctor?.commonPersonId) return null;
    return this.userRepo.findOne({
      where: { commonPerson: { id: doctor.commonPersonId }, deletedAt: IsNull() },
      relations: ['commonPerson'],
    });
  }

  private async replaceDoctorImage(
    manager: EntityManager,
    doctorId: string,
    webp: Buffer,
    uploadedBy: string,
    originalName: string,
  ): Promise<DoctorImage> {
    const stored = this.files.storeDoctorPhotoFile(webp, doctorId);
    await this.deactivateDoctorImages(manager, doctorId);
    const repo = manager.getRepository(DoctorImage);
    return repo.save(
      repo.create({
        doctorId,
        uploadedBy,
        originalName,
        storedName: stored.storedName,
        mimeType: 'image/webp',
        fileSize: webp.length,
        filePath: stored.filePath,
      }),
    );
  }

  private async deactivateDoctorImages(manager: EntityManager, doctorId: string): Promise<void> {
    await manager.getRepository(DoctorImage).update({ doctorId, isActive: true }, { isActive: false });
  }

  /** Doctor detail and list, and the appointment, recipe and history views embed the doctor photo URL. */
  private async invalidateDoctorViews(): Promise<void> {
    for (const scope of ['doctor', 'recipe', 'medical-history', APPOINTMENT_CACHE_SCOPE]) {
      await invalidateScope(this.cache, scope);
    }
  }

  private async invalidateUser(userId: string): Promise<void> {
    await this.cache.del(`user:${userId}`);
    await invalidateScope(this.cache, 'user');
  }
}
