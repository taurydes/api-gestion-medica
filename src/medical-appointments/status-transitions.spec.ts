import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { MedicalAppointmentsService } from './medical-appointments.service';
import {
  AppointmentStatus,
  MedicalAppointment,
} from './entities/medical-appointment.entity';
import { CreateMedicalAppointmentDto } from './dto/create-medical-appointment.dto';
import { UpdateMedicalAppointmentDto } from './dto/update-medical-appointment.dto';
import { CancelMedicalAppointmentDto } from './dto/cancel-medical-appointment.dto';

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

describe('Appointment status contract through the global ValidationPipe (MJ-26)', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const validate = (metatype: any, body: object) => pipe.transform(body, { type: 'body', metatype });
  const messages = async (metatype: any, body: object): Promise<string[]> => {
    try {
      await validate(metatype, body);
      return [];
    } catch (e) {
      return (e as BadRequestException).getResponse()['message'];
    }
  };
  const createBody = {
    patientId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
    doctorId: 'b1b2c3d4-e5f6-4890-abcd-ef1234567890',
    appointmentDate: '2030-01-10T14:00:00.000Z',
    type: 'first_visit',
    reason: 'Control',
  };

  it.each(Object.values(AppointmentStatus))('PATCH /:id with status %s → 400 with a clear message', async (status) => {
    expect(await messages(UpdateMedicalAppointmentDto, { reason: 'x', status })).toEqual([
      'El estado de la cita no se cambia por este endpoint. Use /confirm, /start-consultation, /cancel o /finish-consultation.',
    ]);
  });

  it('PATCH /:id with cancellationReason → 400 pointing to /cancel', async () => {
    expect(await messages(UpdateMedicalAppointmentDto, { cancellationReason: 'x' })).toEqual([
      'Para cancelar la cita use PATCH /medical-appointments/:id/cancel.',
    ]);
  });

  it('PATCH /:id without status keeps working, and the service leaves the status untouched', async () => {
    const { service, current } = setup(AppointmentStatus.CONFIRMED);
    const dto = await validate(UpdateMedicalAppointmentDto, { observations: 'Notas parciales' });

    await service.update('apt-1', dto, 'user-1');

    expect(current()).toBe(AppointmentStatus.CONFIRMED);
  });

  it.each([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED])('POST accepts initial status %s', async (status) => {
    expect(await messages(CreateMedicalAppointmentDto, { ...createBody, status })).toEqual([]);
  });

  it.each([AppointmentStatus.IN_CONSULTATION, AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED])(
    'POST with status %s → 400',
    async (status) => {
      expect(await messages(CreateMedicalAppointmentDto, { ...createBody, status })).toEqual([
        'Una cita nueva solo puede crearse como pendiente (pending) o confirmada (confirmed).',
      ]);
    },
  );

  it.each([{}, { cancellationReason: '' }, { cancellationReason: '   ' }])('cancel without a reason → 400 (%j)', async (body) => {
    expect(await messages(CancelMedicalAppointmentDto, body)).toContain('El motivo de cancelación es requerido.');
  });

  it('cancel stores the trimmed reason', async () => {
    const { service, current } = setup(AppointmentStatus.PENDING);
    const dto = await validate(CancelMedicalAppointmentDto, { cancellationReason: '  No asistirá  ' });

    const apt = await service.cancel('apt-1', dto.cancellationReason);

    expect(current()).toBe(AppointmentStatus.CANCELLED);
    expect(apt.cancellationReason).toBe('No asistirá');
  });
});
