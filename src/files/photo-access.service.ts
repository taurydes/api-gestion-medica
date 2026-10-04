import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { User } from 'src/user/entities/user.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { assertPatientInScope } from 'src/patient/patient-scope';

const FOREIGN_PHOTO = 'No puede cambiar la foto de otra persona.';

/** Who may set whose photo (MJ-43): the owner, an admin, or for a patient whoever may edit that patient. */
@Injectable()
export class PhotoAccessService {
  constructor(
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Patient, DatabaseConnectionName.DB_MAIN)
    private readonly patientRepo: Repository<Patient>,
    private readonly authContext: AuthContextService,
  ) {}

  /** Profile photo: session-only for one's own account (MJ-46); someone else's needs an admin. */
  async assertProfileOwner(actorId: string, ownerId: string | undefined): Promise<void> {
    if (!ownerId || ownerId === actorId) return;
    await this.authContext.assertAdmin(actorId, FOREIGN_PHOTO);
  }

  /** Serving a profile photo: one's own with a session; someone else's only for an admin (security.consultar). */
  async assertCanReadProfile(actorId: string, ownerId: string): Promise<void> {
    if (ownerId === actorId) return;
    await this.authContext.assertAdmin(actorId, 'No tiene acceso a esta foto.');
  }

  /** Person photo: the actor's own person, a patient the actor may edit, or anyone for an admin. */
  async assertCanSetPersonPhoto(actorId: string, personId: string | undefined): Promise<void> {
    if (!personId) throw new ForbiddenException(FOREIGN_PHOTO);
    if (await this.authContext.isAdmin(actorId)) return;
    const actor = await this.userRepo.findOne({ where: { id: actorId }, relations: ['commonPerson'] });
    if (actor?.commonPerson?.id === personId) return;
    const patient = await this.patientRepo.findOne({ where: { commonPersonId: personId } });
    if (!patient) throw new ForbiddenException(FOREIGN_PHOTO);
    await assertPatientInScope(this.patientRepo, patient.id, await this.authContext.resolveScope(actorId));
  }

  /** Doctor photo: the doctor themselves or an admin. */
  async assertCanSetDoctorPhoto(actorId: string, doctorId: string): Promise<void> {
    if (await this.authContext.isAdmin(actorId)) return;
    if ((await this.authContext.getDoctorIdForUser(actorId)) !== doctorId) {
      throw new ForbiddenException(FOREIGN_PHOTO);
    }
  }
}
