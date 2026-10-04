import { NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { assertNoOpenAppointments } from 'src/medical-appointments/open-appointments';
import { Doctor } from './entities/doctor.entity';
import { DoctorSchedule } from './entities/doctor-schedule.entity';

/**
 * Takes a doctor out of a center (MJ-15): 409 while they have open appointments there; otherwise drops
 * the center, their departments of that center and their schedule blocks in it.
 */
export async function detachDoctorFromCenter(
  manager: EntityManager,
  doctorId: string,
  medicalCenterId: string,
): Promise<void> {
  await assertNoOpenAppointments(manager, { doctorId, medicalCenterId }, 'retirar al médico del centro');

  const doctors = manager.getRepository(Doctor);
  const doctor = await doctors.findOne({
    where: { id: doctorId },
    relations: ['medicalCenters', 'departments'],
  });
  if (!doctor) throw new NotFoundException(`Doctor con ID ${doctorId} no encontrado.`);

  doctor.medicalCenters = (doctor.medicalCenters ?? []).filter((mc) => mc.id !== medicalCenterId);
  doctor.departments = (doctor.departments ?? []).filter((d) => d.medicalCenterId !== medicalCenterId);
  await doctors.save(doctor);

  // Soft delete, not deactivate: inactive blocks still count for overlaps in other centers.
  const now = new Date();
  await manager
    .getRepository(DoctorSchedule)
    .update({ doctorId, medicalCenterId, deletedAt: IsNull() }, { deletedAt: now, isActive: false });
}
