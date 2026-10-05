import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AvailabilityQueryDto, AvailableDatesQueryDto } from './dto/availability-query.dto';
import { CreateMedicalAppointmentDto } from './dto/create-medical-appointment.dto';
import { CancelMedicalAppointmentDto } from './dto/cancel-medical-appointment.dto';

// Same options as APP_PIPE in app.module.ts.
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const query = (metatype: any, value: object) => pipe.transform(value, { type: 'query', metatype });
const body = (metatype: any, value: object) => pipe.transform(value, { type: 'body', metatype });
const messagesOf = async (promise: Promise<unknown>) => {
  const error = (await promise.catch((e) => e)) as BadRequestException;
  expect(error).toBeInstanceOf(BadRequestException);
  return JSON.stringify(error.getResponse());
};

const DOC = '11111111-1111-4111-8111-111111111111';
const MC = '22222222-2222-4222-8222-222222222222';

describe('GET /medical-appointments/availability rejects malformed params with 400 (QA H-02)', () => {
  it('well-formed params pass through unchanged', async () => {
    await expect(query(AvailabilityQueryDto, { doctorId: DOC, date: '2026-12-22', medicalCenterId: MC })).resolves.toEqual({
      doctorId: DOC, date: '2026-12-22', medicalCenterId: MC,
    });
    await expect(query(AvailabilityQueryDto, { doctorId: DOC, date: '2026-12-22' })).resolves.toMatchObject({ doctorId: DOC });
  });

  it.each([
    ['doctorId', { doctorId: 'zzz', date: '2026-12-22', medicalCenterId: MC }, 'doctorId debe ser un UUID.'],
    ['medicalCenterId', { doctorId: DOC, date: '2026-12-22', medicalCenterId: 'zzz' }, 'medicalCenterId debe ser un UUID.'],
    ['date garbage', { doctorId: DOC, date: 'basura', medicalCenterId: MC }, 'date debe tener el formato YYYY-MM-DD.'],
    ['date DD-MM-YYYY', { doctorId: DOC, date: '22-12-2026', medicalCenterId: MC }, 'date debe tener el formato YYYY-MM-DD.'],
    ['date with time', { doctorId: DOC, date: '2026-12-22T10:00:00Z', medicalCenterId: MC }, 'date debe tener el formato YYYY-MM-DD.'],
    ['impossible date', { doctorId: DOC, date: '2026-13-45', medicalCenterId: MC }, 'date debe tener el formato YYYY-MM-DD.'],
    ['missing date', { doctorId: DOC }, 'date debe tener el formato YYYY-MM-DD.'],
  ])('%s → 400 naming the field', async (_name, params, message) => {
    expect(await messagesOf(query(AvailabilityQueryDto, params))).toContain(message);
  });
});

describe('GET /medical-appointments/available-dates rejects malformed params with 400 (QA H-02)', () => {
  const valid = { doctorId: DOC, medicalCenterId: MC, startDate: '2026-12-01', endDate: '2026-12-14' };

  it('well-formed params pass', async () => {
    await expect(query(AvailableDatesQueryDto, valid)).resolves.toEqual(valid);
  });

  it.each([
    ['doctorId', { ...valid, doctorId: 'zzz' }, 'doctorId debe ser un UUID.'],
    ['medicalCenterId', { ...valid, medicalCenterId: '123' }, 'medicalCenterId debe ser un UUID.'],
    ['startDate', { ...valid, startDate: '01-12-2026' }, 'startDate debe tener el formato YYYY-MM-DD.'],
    ['endDate', { ...valid, endDate: 'basura' }, 'endDate debe tener el formato YYYY-MM-DD.'],
    ['missing medicalCenterId', { doctorId: DOC, startDate: '2026-12-01', endDate: '2026-12-14' }, 'medicalCenterId debe ser un UUID.'],
  ])('%s → 400 naming the field', async (_name, params, message) => {
    expect(await messagesOf(query(AvailableDatesQueryDto, params))).toContain(message);
  });
});

describe('Appointment free-text fields are bounded (QA H-06)', () => {
  const base = {
    patientId: DOC, doctorId: DOC, medicalCenterId: MC,
    appointmentDate: '2099-01-05T13:00:00.000Z', type: 'first_visit', reason: 'Control',
  };

  it('reason of 500 and observations of 2000 characters pass', async () => {
    await expect(
      body(CreateMedicalAppointmentDto, { ...base, reason: 'r'.repeat(500), observations: 'o'.repeat(2000) }),
    ).resolves.toMatchObject({ reason: 'r'.repeat(500) });
  });

  it('reason of 501 characters → 400', async () => {
    expect(await messagesOf(body(CreateMedicalAppointmentDto, { ...base, reason: 'r'.repeat(501) }))).toContain(
      'El motivo de la cita no puede superar 500 caracteres.',
    );
  });

  it('observations of 2001 characters → 400', async () => {
    expect(await messagesOf(body(CreateMedicalAppointmentDto, { ...base, observations: 'o'.repeat(2001) }))).toContain(
      'Las observaciones no pueden superar 2000 caracteres.',
    );
  });

  it('cancellationReason of 501 characters → 400; 500 passes', async () => {
    expect(await messagesOf(body(CancelMedicalAppointmentDto, { cancellationReason: 'c'.repeat(501) }))).toContain(
      'El motivo de cancelación no puede superar 500 caracteres.',
    );
    await expect(body(CancelMedicalAppointmentDto, { cancellationReason: 'c'.repeat(500) })).resolves.toMatchObject({
      cancellationReason: 'c'.repeat(500),
    });
  });
});
