import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { CreateMedicalAppointmentDto } from 'src/medical-appointments/dto/create-medical-appointment.dto';
import { CreateDoctorScheduleDto } from 'src/doctors/dto/doctor-schedule.dto';
import { DeleteMammographyAnalysisDto } from 'src/mammography-analysis/dto/delete-mammography-analysis.dto';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';
import { createAppValidationPipe, spanishValidationMessages } from './spanish-validation';

const ENGLISH = /\b(must|should|has to)\b/i;

/** Runs the global pipe on a body and returns the messages of its 400. */
async function messagesFor(metatype: any, value: unknown, type: 'body' | 'query' = 'body'): Promise<string[]> {
  try {
    await createAppValidationPipe().transform(value, { type, metatype });
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const body = (error as BadRequestException).getResponse() as any;
    expect(body.statusCode).toBe(400);
    expect(Array.isArray(body.message)).toBe(true);
    return body.message;
  }
  throw new Error('the pipe accepted an invalid body');
}

describe('global ValidationPipe: Spanish messages', () => {
  const uuid = '2b0f7a43-5b8a-4d6a-9d43-1c4a1b8f8f11';

  it('translates the defaults of the appointment DTO and keeps its own Spanish messages', async () => {
    const messages = await messagesFor(CreateMedicalAppointmentDto, {
      patientId: uuid,
      doctorId: uuid,
      specialtyId: 'x',
      medicalCenterId: '',
      appointmentDate: 'mañana',
      durationMinutes: 2,
      type: 'otro',
      reason: 'Control',
    });

    expect(messages).toEqual(
      expect.arrayContaining([
        'specialtyId debe ser un UUID válido.',
        'Indique el centro médico de la cita.',
        'appointmentDate debe ser una fecha válida (ISO 8601).',
        'durationMinutes no debe ser menor que 5.',
        expect.stringMatching(/^type debe ser uno de los siguientes valores: first_visit/),
      ]),
    );
    expect(messages.filter((m) => ENGLISH.test(m))).toEqual([]);
  });

  it('names nested fields by their path', async () => {
    const messages = await messagesFor(CreateDoctorScheduleDto, {
      doctorId: uuid,
      medicalCenterId: uuid,
      blocks: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00', slotDurationMinutes: 5, maxPatientsPerSlot: 1.5 }],
    });

    expect(messages).toEqual([
      'blocks.0.slotDurationMinutes no debe ser menor que 10.',
      'blocks.0.maxPatientsPerSlot debe ser un número entero.',
    ]);
  });

  it('gives the length limit in Spanish', async () => {
    const messages = await messagesFor(DeleteMammographyAnalysisDto, { reason: 'x'.repeat(501) });

    expect(messages).toEqual(['reason no debe superar 500 caracteres.']);
  });

  it('translates the English custom messages of the shared query DTO', async () => {
    const messages = await messagesFor(QueryPaginationDto, { page: 'uno', order: 'sideways' }, 'query');

    expect(messages).toEqual(
      expect.arrayContaining(['page debe ser un número entero.', expect.stringMatching(/^order debe ser uno de/)]),
    );
    expect(messages.filter((m) => ENGLISH.test(m))).toEqual([]);
  });

  it('maps the rest of the constraint keys, falling back to a generic message', () => {
    const error = (property: string, constraints: Record<string, string>, children: ValidationError[] = []) =>
      Object.assign(new ValidationError(), { property, constraints, children });

    expect(
      spanishValidationMessages([
        error('extra', { whitelistValidation: 'property extra should not exist' }),
        error('email', { isEmail: 'email must be an email', isNotEmpty: 'email should not be empty' }),
        error('code', { minLength: 'code must be longer than or equal to 3 characters', matches: 'code must match /x/ regular expression' }),
        error('ids', { isUuid: 'each value in ids must be a UUID', arrayMinSize: 'ids must contain at least 1 elements' }),
        error('active', { isBoolean: 'active must be a boolean value' }),
        error('age', { max: 'age must not be greater than 120', isWeird: 'age must be weird' }),
        error('person', {}, [error('letter', { isLength: 'letter must be longer than or equal to 1 and shorter than or equal to 1 characters' })]),
      ]),
    ).toEqual([
      'La propiedad extra no está permitida.',
      'email debe ser un correo electrónico válido.',
      'email no debe estar vacío.',
      'code debe tener al menos 3 caracteres.',
      'code no tiene un formato válido.',
      'cada valor de ids debe ser un UUID válido.',
      'ids debe tener al menos 1 elemento(s).',
      'active debe ser verdadero o falso.',
      'age no debe ser mayor que 120.',
      'age no es válido.',
      'person.letter debe tener exactamente 1 carácter.',
    ]);
  });
});
