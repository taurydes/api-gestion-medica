import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { IsNull, Repository } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { AppointmentFile } from './entities/appointment-file.entity';
import { GENERAL_FOLDER } from './upload-path.util';

const FOREIGN_FILES = 'No tiene acceso a los archivos de esta cita.';

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

/** Appointment files belong to their appointment: upload target derived from it, access limited to its doctor (MJ-32). */
@Injectable()
export class AppointmentFileAccessService {
  constructor(
    @InjectRepository(MedicalAppointment, DatabaseConnectionName.DB_MAIN)
    private readonly appointmentRepo: Repository<MedicalAppointment>,

    @InjectRepository(MedicalHistory, DatabaseConnectionName.DB_MAIN)
    private readonly historyRepo: Repository<MedicalHistory>,

    private readonly authContextService: AuthContextService,

    @InjectRepository(AppointmentFile, DatabaseConnectionName.DB_MAIN)
    private readonly fileRepo: Repository<AppointmentFile>,
  ) {}

  /** Listing an appointment's files: its doctor or an admin (403); unknown appointment → 404. */
  async assertAppointmentReadable(appointmentId: string, userId: string): Promise<void> {
    const apt = await this.appointmentRepo.findOne({ where: { id: appointmentId, deletedAt: IsNull() } });
    if (!apt) throw new NotFoundException('La cita indicada no existe.');
    await this.authContextService.assertDoctorScope(userId, apt.doctorId, FOREIGN_FILES);
  }

  /** Downloading one file: same rule, through the file's appointment. */
  async assertFileReadable(fileId: string, userId: string): Promise<void> {
    const file = await this.fileRepo.findOne({ where: { id: fileId, deletedAt: IsNull() } });
    if (!file) throw new NotFoundException('Archivo no encontrado.');
    const apt = await this.appointmentRepo.findOne({ where: { id: file.appointmentId } });
    await this.authContextService.assertDoctorScope(userId, apt?.doctorId, FOREIGN_FILES);
  }

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
