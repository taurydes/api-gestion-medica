import { ForbiddenException } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { DataScope } from 'src/common/services/auth-context.service';
import { Patient } from './entities/patient.entity';

/**
 * List bound (MJ-20, MJ-02): patients the user registered, plus those with an appointment of the doctor
 * or, for other staff, an appointment in one of their centers. `null` scope (admin) adds nothing.
 */
export function applyPatientScope(qb: SelectQueryBuilder<Patient>, scope: DataScope | null): void {
  if (!scope) return;
  const params: Record<string, unknown> = { scopeUserId: scope.userId };
  let byAppointment = 'FALSE';
  if (scope.doctorId) {
    byAppointment = `patient.id IN (SELECT ma."patient_id" FROM medical_appointments ma WHERE ma."doctor_id" = :scopeDoctorId AND ma."deleted_at" IS NULL)`;
    params.scopeDoctorId = scope.doctorId;
  } else if (scope.centerIds?.length) {
    byAppointment = `patient.id IN (SELECT ma."patient_id" FROM medical_appointments ma WHERE ma."medical_center_id" IN (:...scopeCenterIds) AND ma."deleted_at" IS NULL)`;
    params.scopeCenterIds = scope.centerIds;
  }
  qb.andWhere(`(patient.createdBy = :scopeUserId OR ${byAppointment})`, params);
}

/** Same rule for one patient (read or write, MJ-21): 403 outside it. */
export async function assertPatientInScope(
  repository: Repository<Patient>,
  patientId: string,
  scope: DataScope | null,
): Promise<void> {
  if (!scope) return;
  const params: unknown[] = [patientId, scope.userId];
  let byAppointment = 'FALSE';
  if (scope.doctorId) {
    byAppointment = 'ma.doctor_id = $3';
    params.push(scope.doctorId);
  } else if (scope.centerIds?.length) {
    byAppointment = 'ma.medical_center_id = ANY($3::uuid[])';
    params.push(scope.centerIds);
  }
  const rows = await repository.query(
    `SELECT 1 FROM patients p
      WHERE p.id = $1
        AND (p.created_by = $2 OR EXISTS (
              SELECT 1 FROM medical_appointments ma
               WHERE ma.patient_id = p.id AND ma.deleted_at IS NULL AND ${byAppointment}))
      LIMIT 1`,
    params,
  );
  if (!rows?.length) {
    throw new ForbiddenException('No tiene acceso a este paciente.');
  }
}
