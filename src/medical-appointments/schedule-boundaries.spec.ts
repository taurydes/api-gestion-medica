import { BadRequestException } from '@nestjs/common';
import { MedicalAppointmentsService } from './medical-appointments.service';
import { DoctorSchedule } from 'src/doctors/entities/doctor-schedule.entity';

/** Service with only the schedule lookup wired: validateDoctorSchedule reads nothing else. */
function serviceWith(blocks: Array<Pick<DoctorSchedule, 'startTime' | 'endTime'>>) {
  const scheduleService = { getScheduleForDoctorOnDay: jest.fn().mockResolvedValue(blocks) };
  const deps: any[] = Array(18).fill({});
  deps[14] = scheduleService;
  return new (MedicalAppointmentsService as any)(...deps) as MedicalAppointmentsService;
}

// A Monday, local time (TZ=America/Caracas in the container).
const at = (hh: number, mm: number) => new Date(2026, 9, 5, hh, mm);
const validate = (svc: MedicalAppointmentsService, date: Date, duration = 30) =>
  (svc as any).validateDoctorSchedule('doc-1', 'mc-1', date, duration);

describe('MedicalAppointmentsService.validateDoctorSchedule — block boundaries', () => {
  // The database returns HH:mm:ss; the appointment time used to be compared as 'HH:mm' text.
  const stored = serviceWith([{ startTime: '08:00:00', endTime: '12:00:00' }]);

  it('accepts an appointment at the exact start of the block', async () => {
    await expect(validate(stored, at(8, 0))).resolves.toBeUndefined();
  });

  it('accepts an appointment that ends exactly at the end of the block', async () => {
    await expect(validate(stored, at(11, 30), 30)).resolves.toBeUndefined();
  });

  it('rejects an appointment that starts at the end of the block', async () => {
    await expect(validate(stored, at(12, 0))).rejects.toThrow(BadRequestException);
  });

  it('rejects an appointment that overruns the end of the block', async () => {
    await expect(validate(stored, at(11, 45), 30)).rejects.toThrow(BadRequestException);
  });

  it('rejects an appointment before the block starts', async () => {
    await expect(validate(stored, at(7, 30))).rejects.toThrow(BadRequestException);
  });

  it('compares mixed HH:mm and HH:mm:ss block formats the same way', async () => {
    const mixed = serviceWith([{ startTime: '08:00', endTime: '12:00:00' }, { startTime: '14:00:00', endTime: '16:00' }]);
    await expect(validate(mixed, at(8, 0))).resolves.toBeUndefined();
    await expect(validate(mixed, at(14, 0))).resolves.toBeUndefined();
    await expect(validate(mixed, at(15, 30))).resolves.toBeUndefined();
    await expect(validate(mixed, at(13, 0))).rejects.toThrow(BadRequestException);
  });
});
