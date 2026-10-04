// Same pinning as reschedule-and-dates.spec.ts: slot math runs in the app timezone.
process.env.TZ = 'America/Caracas';

import { MedicalAppointmentsService } from './medical-appointments.service';
import { AppointmentStatus } from './entities/medical-appointment.entity';
import { authContextFor } from '../../test/auth-context-stub';

type Existing = { appointmentDate: Date; durationMinutes: number; medicalCenterId: string; appointmentNumber: string };

/** Query builder whose getMany returns the overlapping appointments the database would. */
function qbReturning(rows: Existing[]) {
  const qb: any = {};
  for (const m of ['where', 'andWhere', 'orderBy']) qb[m] = jest.fn(() => qb);
  qb.getOne = jest.fn().mockResolvedValue(null);
  qb.getCount = jest.fn().mockResolvedValue(0);
  qb.getMany = jest.fn().mockResolvedValue(rows);
  return qb;
}

// 2030-01-07 is a Monday.
const at = (h: number, m = 0) => new Date(2030, 0, 7, h, m);

function build(block: { slotDurationMinutes: number; maxPatientsPerSlot: number }, existing: Existing[]) {
  const apt = {
    id: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', medicalCenterId: 'mc-1', durationMinutes: 30,
    appointmentDate: at(11), status: AppointmentStatus.PENDING,
  };
  const appointmentRepository = {
    findOne: jest.fn().mockResolvedValue(apt),
    createQueryBuilder: jest.fn(() => qbReturning(existing)),
    save: jest.fn(async (a) => a),
  };
  const blocks = [{ dayOfWeek: 1, startTime: '08:00:00', endTime: '12:00:00', maxDailyAppointments: 20, ...block }];
  const scheduleService = {
    getScheduleForDoctorOnDay: jest.fn(async () => blocks),
    getSchedulesByDoctor: jest.fn(async () => blocks),
  };
  const deps: any[] = Array(18).fill({});
  deps[0] = appointmentRepository;
  deps[3] = { findOne: jest.fn().mockResolvedValue({ id: 'doc-1', medicalCenters: [{ id: 'mc-1' }] }) };
  deps[10] = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  deps[14] = scheduleService;
  deps[16] = authContextFor({ isAdmin: true, doctorId: null });
  const service = new (MedicalAppointmentsService as any)(...deps) as MedicalAppointmentsService;
  jest.spyOn(service as any, 'loadFullAppointment').mockImplementation(async () => apt);
  const moveTo = (date: Date, duration = 30) =>
    service.update('apt-1', { appointmentDate: date.toISOString(), durationMinutes: duration } as any, 'u1');
  return { service, moveTo, appointmentRepository };
}

const other = (date: Date, center = 'mc-1', duration = 30): Existing => ({
  appointmentDate: date, durationMinutes: duration, medicalCenterId: center, appointmentNumber: 'APT-X',
});

describe('Slot capacity on booking and rescheduling (MJ-19)', () => {
  it('one patient per slot: a slot already taken → 400 and nothing is saved', async () => {
    const { moveTo, appointmentRepository } = build({ slotDurationMinutes: 30, maxPatientsPerSlot: 1 }, [other(at(9))]);

    await expect(moveTo(at(9))).rejects.toThrow('El turno de las 09:00 ya está completo: admite 1 paciente(s) y tiene 1.');
    expect(appointmentRepository.save).not.toHaveBeenCalled();
  });

  it('two patients per slot: the second fits, the third does not', async () => {
    await expect(build({ slotDurationMinutes: 30, maxPatientsPerSlot: 2 }, [other(at(9))]).moveTo(at(9))).resolves.toBeDefined();
    await expect(
      build({ slotDurationMinutes: 30, maxPatientsPerSlot: 2 }, [other(at(9)), other(at(9))]).moveTo(at(9)),
    ).rejects.toThrow('ya está completo');
  });

  it('the slot is the configured duration, not the appointment: 60-min slots, 09:30 shares the 09:00 slot', async () => {
    const { moveTo } = build({ slotDurationMinutes: 60, maxPatientsPerSlot: 1 }, [other(at(9), 'mc-1', 30)]);
    // Real DB would not return 09:00–09:30 for 09:30–10:00, so the slot check must widen the window itself.
    await expect(moveTo(at(9, 30))).rejects.toThrow('El turno de las 09:00 ya está completo');
  });

  it('an overlapping appointment in another center is a double booking, whatever the capacity', async () => {
    const { moveTo } = build({ slotDurationMinutes: 30, maxPatientsPerSlot: 5 }, [other(at(9), 'mc-2')]);
    await expect(moveTo(at(9))).rejects.toThrow('El médico ya tiene una cita programada que se solapa');
  });

  it('a free slot → saved', async () => {
    const { moveTo, appointmentRepository } = build({ slotDurationMinutes: 30, maxPatientsPerSlot: 1 }, []);
    await expect(moveTo(at(10))).resolves.toBeDefined();
    expect(appointmentRepository.save).toHaveBeenCalled();
  });
});

describe('Availability uses the slot grid (MJ-19)', () => {
  it('checkAvailability lists every slot with capacity and bookings', async () => {
    const { service } = build({ slotDurationMinutes: 60, maxPatientsPerSlot: 2 }, [other(at(9)), other(at(9, 30))]);

    const { slots, available } = await service.checkAvailability('doc-1', '2030-01-07', 'mc-1');

    expect(slots.map((s) => [s.start.getHours(), s.booked, s.capacity, s.available])).toEqual([
      [8, 0, 2, true], [9, 2, 2, false], [10, 0, 2, true], [11, 0, 2, true],
    ]);
    expect(available).toBe(true);
  });

  it('getAvailableDates caps slotsAvailable by the free places in the slots', async () => {
    // 4 one-hour slots × 1 patient, 3 taken: 1 place left although the daily cap (20) is far.
    const { service } = build({ slotDurationMinutes: 60, maxPatientsPerSlot: 1 }, [other(at(8)), other(at(9)), other(at(10))]);

    const dates = await service.getAvailableDates('doc-1', 'mc-1', '2030-01-07', '2030-01-07');

    expect(dates).toEqual([{ date: '2030-01-07', dayOfWeek: 1, slotsAvailable: 1 }]);
  });
});
