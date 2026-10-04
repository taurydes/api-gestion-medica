import { BadRequestException } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { MedicalAppointmentsService } from './medical-appointments.service';
import {
  AppointmentStatus,
  MedicalAppointment,
} from './entities/medical-appointment.entity';

function setup(status: AppointmentStatus) {
  const db = new InMemoryDb().table(MedicalAppointment, [
    { id: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', status, deletedAt: null },
  ]);
  const cache = { get: jest.fn().mockResolvedValue([]), set: jest.fn(), del: jest.fn() };
  const none = {} as any;
  const service = new MedicalAppointmentsService(
    db.repo(MedicalAppointment),
    none, none, none, none, none, none, none, none, none,
    cache as any,
    none, none, none, none, none, none,
    db.dataSource,
  );
  jest
    .spyOn(service as any, 'loadFullAppointment')
    .mockImplementation(async (id: string) => db.rows(MedicalAppointment).find((a) => a.id === id));
  const current = () => db.rows(MedicalAppointment)[0].status;
  return { service, current };
}

const OTHERS = (allowed: AppointmentStatus) =>
  Object.values(AppointmentStatus).filter((s) => s !== allowed);

describe('MedicalAppointmentsService — dedicated status transitions (MJ-26)', () => {
  it('confirm: pending → confirmed and records the author', async () => {
    const { service, current } = setup(AppointmentStatus.PENDING);

    const apt = await service.confirm('apt-1', 'user-1');

    expect(current()).toBe(AppointmentStatus.CONFIRMED);
    expect(apt.updatedBy).toBe('user-1');
  });

  it.each(OTHERS(AppointmentStatus.PENDING))('confirm from %s → 400 and the status stays', async (from) => {
    const { service, current } = setup(from);

    await expect(service.confirm('apt-1')).rejects.toThrow(BadRequestException);
    expect(current()).toBe(from);
  });

  it('startConsultation: confirmed → in_consultation', async () => {
    const { service, current } = setup(AppointmentStatus.CONFIRMED);

    await service.startConsultation('apt-1', 'user-1');

    expect(current()).toBe(AppointmentStatus.IN_CONSULTATION);
  });

  it.each(OTHERS(AppointmentStatus.CONFIRMED))(
    'startConsultation from %s → 400 and the status stays',
    async (from) => {
      const { service, current } = setup(from);

      await expect(service.startConsultation('apt-1')).rejects.toThrow(
        'Solo se puede iniciar la consulta de una cita confirmada.',
      );
      expect(current()).toBe(from);
    },
  );
});
