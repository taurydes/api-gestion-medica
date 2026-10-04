import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { IsNull, Repository } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { GENERAL_FOLDER } from './upload-path.util';

export interface AppointmentUploadRequest {
  appointmentId: string;
  patientId?: string;
  medicalCenterId?: string;
  medicalHistoryId?: string;
}

export interface AppointmentUploadTarget {
  appointmentId: string;
  patientId: string;
  /** Folder segment: the appointment's center, or `general` when it has none. */
  medicalCenterId: string;
  medicalHistoryId?: string;
}

/** Derives patient, center and history of an appointment upload from the appointment itself (MJ-32). */
@Injectable()
export class AppointmentUploadTargetService {
  constructor(
    @InjectRepository(MedicalAppointment, DatabaseConnectionName.DB_MAIN)
    private readonly appointmentRepo: Repository<MedicalAppointment>,

    @InjectRepository(MedicalHistory, DatabaseConnectionName.DB_MAIN)
    private readonly historyRepo: Repository<MedicalHistory>,

    private readonly authContextService: AuthContextService,
  ) {}

  async resolve(request: AppointmentUploadRequest, userId: string): Promise<AppointmentUploadTarget> {
    if (!isUUID(request.appointmentId ?? '')) {
      throw new BadRequestException('appointmentId debe ser un UUID válido.');
    }
    const apt = await this.appointmentRepo.findOne({
      where: { id: request.appointmentId, deletedAt: IsNull() },
    });
    if (!apt) {
      throw new NotFoundException('La cita indicada no existe.');
    }
    await this.authContextService.assertDoctorScope(
      userId,
      apt.doctorId,
      'Solo el médico asignado puede adjuntar archivos a esta cita.',
    );

    // The body may repeat the appointment's values (the UI sends them) but never contradict them.
    if (request.patientId && request.patientId !== apt.patientId) {
      throw new BadRequestException('patientId no corresponde al paciente de la cita.');
    }
    if (request.medicalCenterId && apt.medicalCenterId && request.medicalCenterId !== apt.medicalCenterId) {
      throw new BadRequestException('medicalCenterId no corresponde al centro de la cita.');
    }

    const history = await this.historyRepo.findOne({
      where: { medicalAppointmentId: apt.id, deletedAt: IsNull() },
    });
    if (request.medicalHistoryId && request.medicalHistoryId !== history?.id) {
      throw new BadRequestException('medicalHistoryId no corresponde al historial de la cita.');
    }

    return {
      appointmentId: apt.id,
      patientId: apt.patientId,
      medicalCenterId: apt.medicalCenterId ?? GENERAL_FOLDER,
      medicalHistoryId: history?.id,
    };
  }
}
