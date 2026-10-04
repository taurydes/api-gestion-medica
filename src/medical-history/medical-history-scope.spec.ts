import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { authContextForUsers, SCOPE_USERS } from '../../test/auth-context-stub';
import { MedicalHistoryService } from './medical-history.service';
import { MedicalHistory } from './entities/medical-history.entity';
import { UpdateMedicalHistoryDto } from './dto/update-medical-history.dto';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';

function setup() {
  const db = new InMemoryDb()
    .table(Patient, [{ id: 'pat-1', deletedAt: null }, { id: 'pat-2', deletedAt: null }])
    .table(Doctor, [{ id: 'doc-a', deletedAt: null }, { id: 'doc-b', deletedAt: null }])
    .table(MedicalCenter)
    .table(Specialty)
    .table(MedicalAppointment, [
      { id: 'apt-b', patientId: 'pat-1', doctorId: 'doc-b', deletedAt: null },
    ])
    .table(MedicalHistory, [
      {
        id: 'his-b', patientId: 'pat-1', doctorId: 'doc-b', medicalAppointmentId: 'apt-b',
        status: 'in_progress', symptoms: 'original', isActive: true, deletedAt: null,
      },
    ]);
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };
  const service = new MedicalHistoryService(
    db.repo(MedicalHistory),
    db.repo(Patient),
    db.repo(Doctor),
    db.repo(MedicalCenter),
    db.repo(Specialty),
    {} as any,
    cache as any,
    {} as any,
    authContextForUsers(SCOPE_USERS),
    db.repo(MedicalAppointment),
  );
  const history = () => db.rows(MedicalHistory).find((h) => h.id === 'his-b')!;
  const created = () => db.rows(MedicalHistory).filter((h) => h.id !== 'his-b');
  return { service, history, created };
}

const newHistory = (doctorId: string, extra: object = {}) =>
  ({ patientId: 'pat-1', doctorId, consultationDate: '2026-10-04T10:00:00Z', reasonForVisit: 'control', ...extra }) as any;

describe('MedicalHistoryService — writes limited to the history doctor (MJ-27)', () => {
  it('doctor A creating a history in doctor B name → 403, nothing saved', async () => {
    const { service, created } = setup();
    await expect(service.create(newHistory('doc-b'), 'user-a')).rejects.toThrow(ForbiddenException);
    expect(created()).toHaveLength(0);
  });

  it('doctor A creates their own history; admin creates one for any doctor', async () => {
    const { service, created } = setup();
    await service.create(newHistory('doc-a'), 'user-a');
    await service.create(newHistory('doc-b'), 'user-admin');
    expect(created().map((h) => h.doctorId)).toEqual(['doc-a', 'doc-b']);
  });

  it('a history linked to an appointment with another patient or doctor → 400 even for an admin', async () => {
    const { service, created } = setup();
    await expect(
      service.create(newHistory('doc-b', { patientId: 'pat-2', medicalAppointmentId: 'apt-b' }), 'user-admin'),
    ).rejects.toThrow('patientId y doctorId deben ser los de la cita indicada.');
    expect(created()).toHaveLength(0);
  });

  it('doctor A updating doctor B history → 403 and the symptoms stay', async () => {
    const { service, history } = setup();
    await expect(service.update('his-b', { symptoms: 'cambiado' }, 'user-a')).rejects.toThrow(ForbiddenException);
    expect(history().symptoms).toBe('original');
  });

  it('doctor B updates their own history; admin updates any', async () => {
    const { service, history } = setup();
    await service.update('his-b', { symptoms: 'por B' }, 'user-b');
    expect(history()).toMatchObject({ symptoms: 'por B', updatedBy: 'user-b' });
    await service.update('his-b', { symptoms: 'por admin' }, 'user-admin');
    expect(history().symptoms).toBe('por admin');
  });

  it('doctor A deleting doctor B history → 403; admin deletes it', async () => {
    const { service, history } = setup();
    await expect(service.remove('his-b', 'user-a')).rejects.toThrow(ForbiddenException);
    expect(history().deletedAt).toBeNull();

    await service.remove('his-b', 'user-admin');
    expect(history().deletedAt).toBeInstanceOf(Date);
  });

  it('doctor B deletes their own history', async () => {
    const { service, history } = setup();
    await service.remove('his-b', 'user-b');
    expect(history().deletedAt).toBeInstanceOf(Date);
  });
});

describe('PATCH /medical-history/:id cannot move a history (MJ-27)', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const validate = (body: object) =>
    pipe.transform(body, { type: 'body', metatype: UpdateMedicalHistoryDto });

  it.each(['patientId', 'doctorId', 'medicalAppointmentId'])('%s in the body → 400', async (field) => {
    await expect(validate({ [field]: '3f2b8a54-8e1c-4b7a-9d2e-1c5f6a7b8c9d' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('clinical fields still pass', async () => {
    await expect(validate({ symptoms: 'x', heartRate: 70 })).resolves.toMatchObject({ symptoms: 'x', heartRate: 70 });
  });
});
