import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppointmentStatus, MedicalAppointment } from './entities/medical-appointment.entity';

type OpenAppointmentFilter = Partial<Record<'medicalCenterId' | 'departmentId' | 'patientId' | 'doctorId', string>>;

/** Live appointments still to be attended: future pending/confirmed ones, or one in consultation now. */
export async function countOpenAppointments(manager: EntityManager, filter: OpenAppointmentFilter): Promise<number> {
  const qb = manager
    .getRepository(MedicalAppointment)
    .createQueryBuilder('apt')
    .where('apt.deletedAt IS NULL')
    .andWhere(
      '((apt.status IN (:...upcoming) AND apt.appointmentDate > :now) OR apt.status = :inConsultation)',
      {
        upcoming: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        now: new Date(),
        inConsultation: AppointmentStatus.IN_CONSULTATION,
      },
    );
  for (const [column, value] of Object.entries(filter)) {
    qb.andWhere(`apt.${column} = :${column}`, { [column]: value });
  }
  return qb.getCount();
}

/** 409 while open appointments depend on the record (MJ-12, MJ-15): they must be cancelled or moved first. */
export async function assertNoOpenAppointments(
  manager: EntityManager,
  filter: OpenAppointmentFilter,
  action: string,
): Promise<void> {
  const open = await countOpenAppointments(manager, filter);
  if (open > 0) {
    throw new ConflictException(
      `No se puede ${action}: tiene ${open} cita(s) pendiente(s) o en curso. Cancélelas o reprográmelas primero.`,
    );
  }
}
