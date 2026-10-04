import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserMedicalCenter } from 'src/user/entities/user-medical-center.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { User } from 'src/user/entities/user.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import {
  ADMIN_SCOPE_PERMISSION,
  UserAccessService,
} from './user-access.service';

/** Read bound of a non-admin user: a doctor by doctorId, other staff by their centers (centerIds). */
export interface DataScope {
  userId: string;
  doctorId: string | null;
  centerIds: string[] | null;
}

export interface AuthContext {
  userId: string;
  doctorId: string | null;
  isDoctor: boolean;
  medicalCenterIds: string[];
}

/**
 * Servicio compartido que resuelve el contexto del usuario autenticado.
 * Determina si es doctor y a qué centros médicos está asociado.
 * Usado por los servicios que necesitan filtrar datos por IDOR.
 */
@Injectable()
export class AuthContextService {
  constructor(
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Doctor, DatabaseConnectionName.DB_MAIN)
    private readonly doctorRepo: Repository<Doctor>,

    private readonly userAccessService: UserAccessService,

    // Optional so the scope stubs of older specs still build the service
    @Optional()
    @InjectRepository(UserMedicalCenter, DatabaseConnectionName.DB_MAIN)
    private readonly userCentersRepo?: Repository<UserMedicalCenter>,
  ) {}

  /**
   * Who bounds a read: an admin nothing (`null`), a doctor their own doctorId, any other staff user the
   * centers assigned to them (MJ-02; an empty list leaves only what they created).
   */
  async resolveScope(userId: string | undefined): Promise<DataScope | null> {
    if (!userId || (await this.isAdmin(userId))) return null;
    const doctorId = await this.getDoctorIdForUser(userId);
    if (doctorId) return { userId, doctorId, centerIds: null };
    return { userId, doctorId: null, centerIds: await this.getStaffCenterIds(userId) };
  }

  /** Live centers of a staff user (users_medical_centers). */
  async getStaffCenterIds(userId: string): Promise<string[]> {
    if (!this.userCentersRepo) return [];
    const links = await this.userCentersRepo.find({ where: { userId, deletedAt: IsNull() } });
    return links.map((link) => link.medicalCenterId);
  }

  /** Admin con alcance global: se decide por permiso del rol, no por el nombre del rol. */
  async isAdmin(userId: string): Promise<boolean> {
    return this.userAccessService.hasPermission(userId, ADMIN_SCOPE_PERMISSION);
  }

  /** doctorId que restringe la consulta, o `null` si el usuario es admin o no es médico. */
  async getScopedDoctorId(userId: string | undefined): Promise<string | null> {
    if (!userId) return null;
    if (await this.isAdmin(userId)) return null;
    return this.getDoctorIdForUser(userId);
  }

  /** 403 when a non-admin doctor writes on a resource owned by another doctor; admins and non-doctors pass. */
  async assertDoctorScope(
    userId: string | undefined,
    ownerDoctorId: string | null | undefined,
    message = 'Solo el médico asignado puede realizar esta acción.',
  ): Promise<void> {
    const myDoctorId = await this.getScopedDoctorId(userId);
    if (myDoctorId && myDoctorId !== ownerDoctorId) {
      throw new ForbiddenException(message);
    }
  }

  /** 403 unless the user has the admin-scope permission. */
  async assertAdmin(userId: string | undefined, message: string): Promise<void> {
    if (!userId || !(await this.isAdmin(userId))) {
      throw new ForbiddenException(message);
    }
  }

  async resolve(authUser: any): Promise<AuthContext> {
    const userId = authUser?.id;
    if (!userId) {
      return { userId: '', doctorId: null, isDoctor: false, medicalCenterIds: [] };
    }

    const doctorId = await this.getDoctorIdForUser(userId);
    let medicalCenterIds: string[] = [];

    if (doctorId) {
      medicalCenterIds = await this.getMedicalCenterIdsForDoctor(doctorId);
    }

    return {
      userId,
      doctorId,
      isDoctor: !!doctorId,
      medicalCenterIds,
    };
  }

  async getDoctorIdForUser(userId: string): Promise<string | null> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['commonPerson'],
    });
    if (!user?.commonPerson) return null;

    const doctor = await this.doctorRepo.findOne({
      where: { commonPersonId: user.commonPerson.id },
    });
    return doctor?.id ?? null;
  }

  private async getMedicalCenterIdsForDoctor(doctorId: string): Promise<string[]> {
    const doctor = await this.doctorRepo.findOne({
      where: { id: doctorId },
      relations: ['medicalCenters'],
    });
    return doctor?.medicalCenters?.map((mc) => mc.id) ?? [];
  }

  /**
   * Retorna los centros médicos completos asociados a un doctor.
   * Útil para construir el resumen de centros médicos en /auth/me.
   */
  async getMedicalCentersForDoctor(doctorId: string): Promise<MedicalCenter[]> {
    const doctor = await this.doctorRepo.findOne({
      where: { id: doctorId },
      relations: ['medicalCenters'],
    });
    return doctor?.medicalCenters ?? [];
  }
}
