import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { authContextForUsers, SCOPE_USERS } from '../../test/auth-context-stub';
import { MedicalAppointmentsService } from './medical-appointments.service';
import {
  AppointmentStatus,
  MedicalAppointment,
} from './entities/medical-appointment.entity';

function setup(status = AppointmentStatus.PENDING) {
  const db = new InMemoryDb().table(MedicalAppointment, [
    { id: 'apt-b', patientId: 'pat-1', doctorId: 'doc-b', status, reason: 'control', deletedAt: null },
  ]);
  const cache = { get: jest.fn().mockResolvedValue([]), set: jest.fn(), del: jest.fn() };
  const none = {} as any;
  const service = new MedicalAppointmentsService(
    db.repo(MedicalAppointment),
    none, none, none, none, none, none, none, none, none,
    cache as any,
    none, none, none, none, none,
    authContextForUsers(SCOPE_USERS),
    db.dataSource,
  );
  jest
    .spyOn(service as any, 'loadFullAppointment')
    .mockImplementation(async (id: string) => db.rows(MedicalAppointment).find((a) => a.id === id));
  const apt = () => db.rows(MedicalAppointment)[0];
  return { service, apt };
}

type Write = (s: MedicalAppointmentsService, userId: string) => Promise<unknown>;

// Each write with the status it needs to succeed, so "own → ok" proves the scope is the only gate.
const WRITES: Array<[string, AppointmentStatus, Write]> = [
  ['update', AppointmentStatus.PENDING, (s, u) => s.update('apt-b', { reason: 'otro motivo' } as any, u)],
  ['confirm', AppointmentStatus.PENDING, (s, u) => s.confirm('apt-b', u)],
  ['startConsultation', AppointmentStatus.CONFIRMED, (s, u) => s.startConsultation('apt-b', u)],
  ['cancel', AppointmentStatus.PENDING, (s, u) => s.cancel('apt-b', 'motivo', u)],
  ['remove', AppointmentStatus.PENDING, (s, u) => s.remove('apt-b', u)],
];

describe('MedicalAppointmentsService — writes limited to the appointment doctor (MJ-27)', () => {
  it.each(WRITES)('%s by doctor A on doctor B appointment → 403 and nothing changes', async (_name, status, write) => {
    const { service, apt } = setup(status);
    const before = { ...apt() };

    await expect(write(service, 'user-a')).rejects.toThrow(ForbiddenException);

    expect(apt()).toEqual(before);
  });

  it.each(WRITES)('%s by doctor B on their own appointment → ok', async (_name, status, write) => {
    const { service, apt } = setup(status);

    await write(service, 'user-b');

    expect(apt().updatedBy).toBe('user-b');
  });

  it.each(WRITES)('%s by an admin on any appointment → ok', async (_name, status, write) => {
    const { service, apt } = setup(status);

    await write(service, 'user-admin');

    expect(apt().updatedBy).toBe('user-admin');
  });

  it('doctor B reassigning their appointment to doctor A → 403', async () => {
    const { service, apt } = setup();

    await expect(service.update('apt-b', { doctorId: 'doc-a' } as any, 'user-b')).rejects.toThrow(
      ForbiddenException,
    );
    expect(apt().doctorId).toBe('doc-b');
  });
});

describe('MedicalAppointmentsService.create — a doctor books only in their own name (MJ-27)', () => {
  const booking = (doctorId: string) =>
    ({ doctorId, medicalCenterId: 'mc-1', patientId: 'pat-1', appointmentDate: '2099-01-05T13:00:00Z', type: 'first_visit', reason: 'control' }) as any;

  function withDoctorStep() {
    const { service } = setup();
    // The center lookup is the first step after the scope check; reaching it means the call got through.
    const doctorLookup = jest.fn().mockRejectedValue(new BadRequestException('doctor step reached'));
    (service as any).medicalCenterRepository = { findOne: doctorLookup };
    return { service, doctorLookup };
  }

  it('doctor A booking for doctor B → 403 before any patient is resolved or created', async () => {
    const { service, doctorLookup } = withDoctorStep();
    await expect(service.create(booking('doc-b'), 'user-a')).rejects.toThrow(ForbiddenException);
    expect(doctorLookup).not.toHaveBeenCalled();
  });

  it('doctor A booking for themselves and an admin booking for anyone pass the scope check', async () => {
    const { service } = withDoctorStep();
    await expect(service.create(booking('doc-a'), 'user-a')).rejects.toThrow('doctor step reached');
    await expect(service.create(booking('doc-b'), 'user-admin')).rejects.toThrow('doctor step reached');
  });
});
