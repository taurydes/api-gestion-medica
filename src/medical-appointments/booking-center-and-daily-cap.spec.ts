// Same pinning as slot-capacity.spec.ts: slot math runs in the app timezone.
process.env.TZ = 'America/Caracas';

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MedicalAppointmentsService } from './medical-appointments.service';
import { AppointmentStatus } from './entities/medical-appointment.entity';
import { authContextFor } from '../../test/auth-context-stub';
import { transactionOver } from '../../test/fake-data-source';

type Existing = { appointmentDate: Date; durationMinutes: number; medicalCenterId: string; appointmentNumber: string };
type Block = { startTime: string; endTime: string; maxDailyAppointments: number };

// 2030-01-07 is a Monday.
const at = (h: number, m = 0) => new Date(2030, 0, 7, h, m);
const booked = (date: Date): Existing => ({
  appointmentDate: date, durationMinutes: 30, medicalCenterId: 'mc-1', appointmentNumber: 'APT-X',
});

/** Real service; the query builder returns `existing` (getMany) and its size (getCount), as the DB would for that day. */
function build(blocks: Block[], existing: Existing[], aptOverrides: Record<string, unknown> = {}) {
  const apt = {
    id: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', medicalCenterId: 'mc-1', durationMinutes: 30,
    appointmentDate: at(7), status: AppointmentStatus.PENDING, ...aptOverrides,
  };
  const qb: any = {};
  for (const m of ['where', 'andWhere', 'orderBy']) qb[m] = jest.fn(() => qb);
  qb.getOne = jest.fn().mockResolvedValue(null);
  qb.getCount = jest.fn().mockResolvedValue(existing.length);
  qb.getMany = jest.fn().mockResolvedValue(existing);
  const appointmentRepository = {
    findOne: jest.fn().mockResolvedValue(apt),
    createQueryBuilder: jest.fn(() => qb),
    save: jest.fn(async (a) => a),
  };
  const fullBlocks = blocks.map((b) => ({ dayOfWeek: 1, slotDurationMinutes: 30, maxPatientsPerSlot: 1, ...b }));
  const doctorRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'doc-1', medicalCenters: [{ id: 'mc-1' }] }),
  };
  const centerRepository = { findOne: jest.fn(async ({ where }) => (where.id === 'mc-9' ? null : { id: where.id })) };
  const deps: any[] = Array(18).fill({});
  deps[0] = appointmentRepository;
  deps[3] = doctorRepository;
  deps[5] = centerRepository;
  deps[10] = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  deps[14] = {
    getScheduleForDoctorOnDay: jest.fn(async () => fullBlocks),
    getSchedulesByDoctor: jest.fn(async () => fullBlocks),
  };
  deps[16] = authContextFor({ isAdmin: true, doctorId: null });
  deps[17] = transactionOver({ MedicalAppointment: appointmentRepository });
  const service = new (MedicalAppointmentsService as any)(...deps) as MedicalAppointmentsService;
  jest.spyOn(service as any, 'loadFullAppointment').mockImplementation(async () => apt);
  const moveTo = (date: Date, extra: Record<string, unknown> = {}) =>
    service.update('apt-1', { appointmentDate: date.toISOString(), ...extra } as any, 'u1');
  return { service, moveTo, appointmentRepository, doctorRepository };
}

const booking = (extra: Record<string, unknown> = {}) =>
  ({ doctorId: 'doc-1', patientId: 'pat-1', appointmentDate: at(10).toISOString(), type: 'first_visit', reason: 'control', ...extra }) as any;

describe('A booking always names a center the doctor works in (MJ-24)', () => {
  it('create without a center → 400 and the doctor is not even looked up', async () => {
    const { service, doctorRepository, appointmentRepository } = build([{ startTime: '08:00', endTime: '12:00', maxDailyAppointments: 20 }], []);

    await expect(service.create(booking(), 'u1')).rejects.toThrow('Indique el centro médico de la cita.');
    expect(doctorRepository.findOne).not.toHaveBeenCalled();
    expect(appointmentRepository.save).not.toHaveBeenCalled();
  });

  it('create in a center that does not exist → 404', async () => {
    const { service } = build([{ startTime: '08:00', endTime: '12:00', maxDailyAppointments: 20 }], []);
    await expect(service.create(booking({ medicalCenterId: 'mc-9' }), 'u1')).rejects.toThrow(NotFoundException);
  });

  it('create in a center the doctor is not assigned to → 400', async () => {
    const { service } = build([{ startTime: '08:00', endTime: '12:00', maxDailyAppointments: 20 }], []);
    await expect(service.create(booking({ medicalCenterId: 'mc-2' }), 'u1')).rejects.toThrow(
      'El médico no está asignado a este centro médico.',
    );
  });

  it('rescheduling to a center the doctor is not assigned to → 400, nothing saved', async () => {
    const { moveTo, appointmentRepository } = build([{ startTime: '08:00', endTime: '12:00', maxDailyAppointments: 20 }], []);
    await expect(moveTo(at(10), { medicalCenterId: 'mc-2' })).rejects.toThrow(BadRequestException);
    expect(appointmentRepository.save).not.toHaveBeenCalled();
  });

  it('rescheduling a legacy appointment without a center → 400 asking for one', async () => {
    const { moveTo, appointmentRepository } = build(
      [{ startTime: '08:00', endTime: '12:00', maxDailyAppointments: 20 }], [], { medicalCenterId: null },
    );
    await expect(moveTo(at(10))).rejects.toThrow('Indique el centro médico de la cita para reprogramarla.');
    expect(appointmentRepository.save).not.toHaveBeenCalled();
  });

  it('rescheduling outside the doctor\'s hours is rejected now that the center is always known', async () => {
    const { moveTo } = build([{ startTime: '08:00', endTime: '12:00', maxDailyAppointments: 20 }], []);
    await expect(moveTo(at(15))).rejects.toThrow('no está dentro del horario del doctor');
  });
});

describe('Daily cap = sum of the day\'s blocks, whatever their order (MJ-19)', () => {
  const morning: Block = { startTime: '08:00', endTime: '10:00', maxDailyAppointments: 1 };
  const afternoon: Block = { startTime: '14:00', endTime: '18:00', maxDailyAppointments: 2 };
  const twoTaken = [booked(at(8)), booked(at(14))];
  const threeTaken = [...twoTaken, booked(at(15))];

  it.each([
    ['morning first', [morning, afternoon]],
    ['afternoon first', [afternoon, morning]],
  ])('%s: 2 of 3 taken → the third fits', async (_label, blocks) => {
    const { moveTo, appointmentRepository } = build(blocks, twoTaken);
    await expect(moveTo(at(16))).resolves.toBeDefined();
    expect(appointmentRepository.save).toHaveBeenCalled();
  });

  it.each([
    ['morning first', [morning, afternoon]],
    ['afternoon first', [afternoon, morning]],
  ])('%s: 3 of 3 taken → 400 with the summed cap', async (_label, blocks) => {
    const { moveTo } = build(blocks, threeTaken);
    await expect(moveTo(at(17))).rejects.toThrow('El doctor ya alcanzó el máximo de 3 citas para este día');
  });

  it('availability with the day full: every slot unavailable and available=false', async () => {
    const { service } = build([morning, afternoon], threeTaken);

    const { slots, available, currentCount } = await service.checkAvailability('doc-1', '2030-01-07', 'mc-1');

    expect(currentCount).toBe(3);
    expect(available).toBe(false);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => !s.available)).toBe(true);
  });

  it('availability below the cap keeps free slots open', async () => {
    const { service } = build([morning, afternoon], twoTaken);
    const { slots, available } = await service.checkAvailability('doc-1', '2030-01-07', 'mc-1');
    expect(available).toBe(true);
    expect(slots.filter((s) => s.available).length).toBeGreaterThan(0);
  });

  it('available-dates uses the summed cap: 2 of 3 taken → 1 place left', async () => {
    const { service } = build([afternoon, morning], twoTaken);
    const dates = await service.getAvailableDates('doc-1', 'mc-1', '2030-01-07', '2030-01-07');
    expect(dates).toEqual([{ date: '2030-01-07', dayOfWeek: 1, slotsAvailable: 1 }]);
  });
});
