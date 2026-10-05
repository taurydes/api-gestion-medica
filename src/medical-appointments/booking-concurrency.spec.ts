// Slot math runs in the app timezone, like the other appointment specs.
process.env.TZ = 'America/Caracas';

import { BadRequestException } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { authContextFor } from '../../test/auth-context-stub';
import { MedicalAppointmentsService } from './medical-appointments.service';
import { AppointmentStatus, MedicalAppointment } from './entities/medical-appointment.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';

type Capacity = { maxPatientsPerSlot: number; maxDailyAppointments: number };
type Existing = { id: string; patientId: string; appointmentDate: Date };

// 2030-01-07 is a Monday; the block below covers 08:00–12:00 in 30-minute slots.
const at = (h: number, m = 0) => new Date(2030, 0, 7, h, m);
const DAY_KEY = 'doc-1:2030-01-07';

/** Real service over the in-memory DB: the real slot and daily-cap validators count its rows. */
function setup(capacity: Capacity, existing: Existing[] = []) {
  const db = new InMemoryDb()
    .table(CommonPerson)
    .table(Patient, [1, 2, 3, 4, 5, 6].map((i) => ({ id: `pat-${i}`, commonPersonId: `cp-${i}`, deletedAt: null })))
    .table(
      MedicalAppointment,
      existing.map((a) => ({
        doctorId: 'doc-1', medicalCenterId: 'mc-1', durationMinutes: 30, status: AppointmentStatus.PENDING,
        deletedAt: null, appointmentNumber: `APT-${a.id}`, ...a,
      })),
    )
    .table(MedicalCenter, [{ id: 'mc-1', deletedAt: null }])
    .table(Doctor, [{ id: 'doc-1', deletedAt: null, medicalCenters: [{ id: 'mc-1' }] }]);
  const block = { dayOfWeek: 1, startTime: '08:00:00', endTime: '12:00:00', slotDurationMinutes: 30, ...capacity };
  const scheduleService = {
    getScheduleForDoctorOnDay: jest.fn(async () => [block]),
    getSchedulesByDoctor: jest.fn(async () => [block]),
  };
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const none = {} as any;
  const service = new MedicalAppointmentsService(
    db.repo(MedicalAppointment),
    db.repo(Patient),
    db.repo(CommonPerson),
    db.repo(Doctor),
    none, db.repo(MedicalCenter), none, none, none, none,
    cache as any,
    none, none, none,
    scheduleService as any,
    none,
    authContextFor({ isAdmin: true, doctorId: null }),
    db.dataSource,
  );
  jest
    .spyOn(service as any, 'loadFullAppointment')
    .mockImplementation(async (id: string) => db.rows(MedicalAppointment).find((a) => a.id === id));
  return { service, db };
}

const booking = (patient: number, date: Date) =>
  ({
    patientId: `pat-${patient}`, doctorId: 'doc-1', medicalCenterId: 'mc-1',
    appointmentDate: date.toISOString(), type: 'first_visit', reason: 'QA',
  }) as any;

const active = (db: InMemoryDb) => db.rows(MedicalAppointment).filter((a) => a.status !== AppointmentStatus.CANCELLED);

async function raceCreates(service: MedicalAppointmentsService, dates: Date[]) {
  const results = await Promise.allSettled(dates.map((date, i) => service.create(booking(i + 1, date), 'u1')));
  return {
    created: results.filter((r) => r.status === 'fulfilled').length,
    rejected: results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason),
  };
}

describe('Concurrent bookings of one doctor serialize on the doctor/day advisory lock (HU-05.1 RN-06b, MJ-19)', () => {
  it('six simultaneous bookings for a 1-patient slot → one created, five 400, one row', async () => {
    const { service, db } = setup({ maxPatientsPerSlot: 1, maxDailyAppointments: 20 });

    const { created, rejected } = await raceCreates(service, Array(6).fill(at(10)));

    expect(created).toBe(1);
    expect(rejected).toHaveLength(5);
    rejected.forEach((e) => {
      expect(e).toBeInstanceOf(BadRequestException);
      expect(e.message).toContain('El turno de las 10:00 ya está completo');
    });
    expect(active(db)).toHaveLength(1);
  });

  it('six simultaneous bookings in different slots of a 1-appointment day → one row (daily cap race)', async () => {
    const { service, db } = setup({ maxPatientsPerSlot: 5, maxDailyAppointments: 1 });

    const { created, rejected } = await raceCreates(service, [at(8), at(9), at(10), at(11), at(8, 30), at(9, 30)]);

    expect(created).toBe(1);
    expect(rejected).toHaveLength(5);
    rejected.forEach((e) => expect(e.message).toContain('máximo de 1 citas'));
    expect(active(db)).toHaveLength(1);
  });

  it('two appointments rescheduled at once into the same free 1-patient slot → only one moves', async () => {
    const { service, db } = setup({ maxPatientsPerSlot: 1, maxDailyAppointments: 20 }, [
      { id: 'apt-a', patientId: 'pat-1', appointmentDate: at(8) },
      { id: 'apt-b', patientId: 'pat-2', appointmentDate: at(9) },
    ]);

    const results = await Promise.allSettled(
      ['apt-a', 'apt-b'].map((id) => service.update(id, { appointmentDate: at(11).toISOString() } as any, 'u1')),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(active(db).filter((a) => a.appointmentDate.getTime() === at(11).getTime())).toHaveLength(1);
    expect(db.locks).toEqual([DAY_KEY, DAY_KEY]);
  });

  it('the lock is taken inside the transaction, keyed by doctor and local day, before the counts and the insert', async () => {
    const { service, db } = setup({ maxPatientsPerSlot: 1, maxDailyAppointments: 20 });
    const real = (service as any).validateSlotCapacity.bind(service);
    const locksWhenCounting: number[] = [];
    jest.spyOn(service as any, 'validateSlotCapacity').mockImplementation(async (...args: unknown[]) => {
      locksWhenCounting.push(db.locks.length);
      return real(...args);
    });

    await service.create(booking(1, at(10)), 'u1');

    expect(db.locks).toEqual([DAY_KEY]);
    expect(locksWhenCounting).toEqual([1]);
    // The fake refuses a lock taken after a write, so reaching here also proves the order lock → write.
    expect(active(db)).toHaveLength(1);
  });

  it('without the lock the same fake lets every booking through — the race the API showed before the fix', async () => {
    const { service, db } = setup({ maxPatientsPerSlot: 1, maxDailyAppointments: 20 });
    jest.spyOn(service as any, 'lockDoctorDay').mockResolvedValue(undefined);

    const { created } = await raceCreates(service, Array(6).fill(at(10)));

    // Six 201s for one place; the fake commits whole tables, so only the outcome count is meaningful here.
    expect(created).toBe(6);
  });
});
