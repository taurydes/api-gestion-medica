// The container runs with TZ=America/Caracas; pin it so the day-boundary cases mean the same on any host.
process.env.TZ = 'America/Caracas';

import { BadRequestException } from '@nestjs/common';
import { MedicalAppointmentsService } from './medical-appointments.service';
import { AppointmentStatus } from './entities/medical-appointment.entity';
import { formatLocalDate, parseLocalDate } from 'src/doctors/schedule-time.util';

/** Query builder stub: no conflicting appointment, zero appointments counted. */
function emptyQb() {
  const qb: any = {};
  for (const m of ['where', 'andWhere', 'orderBy']) qb[m] = jest.fn(() => qb);
  qb.getOne = jest.fn().mockResolvedValue(null);
  qb.getCount = jest.fn().mockResolvedValue(0);
  qb.getMany = jest.fn().mockResolvedValue([]);
  return qb;
}

function build(blocks: Array<{ dayOfWeek: number; startTime: string; endTime: string; maxDailyAppointments?: number }>) {
  const apt = {
    id: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', medicalCenterId: 'mc-1', durationMinutes: 30,
    appointmentDate: new Date(2030, 0, 7, 9, 0), status: AppointmentStatus.PENDING,
  };
  const appointmentRepository = {
    findOne: jest.fn().mockResolvedValue(apt),
    createQueryBuilder: jest.fn(() => emptyQb()),
    save: jest.fn(async (a) => a),
  };
  const scheduleService = {
    getScheduleForDoctorOnDay: jest.fn(async (_d, _c, day: number) =>
      blocks.filter((b) => b.dayOfWeek === day).map((b) => ({ maxDailyAppointments: 20, ...b }))),
    getSchedulesByDoctor: jest.fn(async () => blocks.map((b) => ({ maxDailyAppointments: 20, ...b }))),
  };
  const deps: any[] = Array(18).fill({});
  deps[0] = appointmentRepository;
  deps[3] = { findOne: jest.fn().mockResolvedValue({ id: 'doc-1' }) };
  deps[10] = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  deps[14] = scheduleService;
  const service = new (MedicalAppointmentsService as any)(...deps) as MedicalAppointmentsService;
  jest.spyOn(service as any, 'loadFullAppointment').mockImplementation(async () => apt);
  return { service, apt, appointmentRepository };
}

// 2030-01-07 is a Monday.
const MONDAY_8_TO_12 = [{ dayOfWeek: 1, startTime: '08:00:00', endTime: '12:00:00' }];
const local = (h: number, m = 0) => new Date(2030, 0, 7, h, m).toISOString();

describe('MedicalAppointmentsService.update — rescheduling re-validates the schedule', () => {
  it('moving the appointment outside the doctor block → 400 and nothing is saved', async () => {
    const { service, appointmentRepository } = build(MONDAY_8_TO_12);

    await expect(service.update('apt-1', { appointmentDate: local(15) } as any, 'u1')).rejects.toThrow(BadRequestException);
    expect(appointmentRepository.save).not.toHaveBeenCalled();
  });

  it('moving it to a day without schedule → 400', async () => {
    const { service } = build(MONDAY_8_TO_12);
    const tuesday = new Date(2030, 0, 8, 9, 0).toISOString();

    await expect(service.update('apt-1', { appointmentDate: tuesday } as any, 'u1')).rejects.toThrow(BadRequestException);
  });

  it('lengthening it past the block end → 400', async () => {
    const { service } = build([{ dayOfWeek: 1, startTime: '08:00:00', endTime: '09:30:00' }]);

    await expect(service.update('apt-1', { durationMinutes: 60 } as any, 'u1')).rejects.toThrow(BadRequestException);
  });

  it('moving it inside the block (including its first slot) → saved with the new date', async () => {
    const { service, apt, appointmentRepository } = build(MONDAY_8_TO_12);

    await expect(service.update('apt-1', { appointmentDate: local(8) } as any, 'u1')).resolves.toBeDefined();
    expect(appointmentRepository.save).toHaveBeenCalled();
    expect(apt.appointmentDate.getHours()).toBe(8);
  });

  it('a change that does not touch date, doctor, center or duration skips the schedule check', async () => {
    const { service, appointmentRepository } = build([]);

    await expect(service.update('apt-1', { reason: 'nuevo motivo' } as any, 'u1')).resolves.toBeDefined();
    expect(appointmentRepository.save).toHaveBeenCalled();
  });
});

describe('MedicalAppointmentsService.getAvailableDates — dates in the app timezone', () => {
  it('returns the doctor weekdays with their own calendar date', async () => {
    const { service } = build([{ dayOfWeek: 1, startTime: '08:00:00', endTime: '12:00:00' }, { dayOfWeek: 3, startTime: '08:00:00', endTime: '12:00:00' }]);

    const dates = await service.getAvailableDates('doc-1', 'mc-1', '2026-10-05', '2026-10-11');

    // UTC parsing used to shift every day back one (Monday 10-05 became Sunday 10-04 at 20:00).
    expect(dates.map((d) => [d.date, d.dayOfWeek])).toEqual([['2026-10-05', 1], ['2026-10-07', 3]]);
  });

  it('a time near midnight in Caracas keeps its day (toISOString would give the next one)', () => {
    const lateNight = new Date(2026, 9, 5, 23, 30);

    expect(lateNight.toISOString().slice(0, 10)).toBe('2026-10-06');
    expect(formatLocalDate(lateNight)).toBe('2026-10-05');
    expect(parseLocalDate('2026-10-05').getDay()).toBe(1);
  });
});
