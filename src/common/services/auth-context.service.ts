import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { User } from 'src/user/entities/user.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';

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
  ) {}

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
}
