import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { authContextFor } from '../../test/auth-context-stub';
import { MedicalAppointmentsService } from './medical-appointments.service';
import { MedicalAppointment } from './entities/medical-appointment.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';

function setup() {
  const db = new InMemoryDb()
    .table(CommonPerson)
    .table(Patient)
    .table(MedicalAppointment)
    .table(Doctor, [{ id: 'doc-1', deletedAt: null }]);
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const none = {} as any;
  const service = new MedicalAppointmentsService(
    db.repo(MedicalAppointment),
    db.repo(Patient),
    db.repo(CommonPerson),
    db.repo(Doctor),
    none, none, none, none, none, none,
    cache as any,
    none, none, none, none, none,
    authContextFor({ isAdmin: true, doctorId: null }),
    db.dataSource,
  );
  jest
    .spyOn(service as any, 'loadFullAppointment')
    .mockImplementation(async (id: string) => db.rows(MedicalAppointment).find((a) => a.id === id));
  return { service, db };
}

// A person not registered yet: the booking creates persona_comun + patient on the way.
const newPersonBooking = (doctorId = 'doc-1') =>
  ({
    doctorId,
    documentLetter: 'V',
    documentNumber: '30111222',
    newPatientData: { commonPerson: { firstName: 'Ana', lastName: 'Rivas' } },
    appointmentDate: '2099-01-05T13:00:00Z',
    type: 'first_visit',
    reason: 'control',
  }) as any;

describe('MedicalAppointmentsService.create — patient and appointment commit together (MJ-25)', () => {
  it('a valid booking for a new person creates person, patient and appointment', async () => {
    const { service, db } = setup();

    await service.create(newPersonBooking(), 'u1');

    expect(db.rows(CommonPerson)).toHaveLength(1);
    expect(db.rows(Patient)).toHaveLength(1);
    expect(db.rows(MedicalAppointment)[0]).toMatchObject({ patientId: db.rows(Patient)[0].id, createdBy: 'u1' });
  });

  it('a failing appointment save rolls back the new person and patient', async () => {
    const { service, db } = setup();
    db.failSaves(MedicalAppointment, 1);

    await expect(service.create(newPersonBooking(), 'u1')).rejects.toThrow();

    expect(db.rows(CommonPerson)).toHaveLength(0);
    expect(db.rows(Patient)).toHaveLength(0);
    expect(db.rows(MedicalAppointment)).toHaveLength(0);
  });

  it('a rejected booking (unknown doctor) writes nothing, not even the patient', async () => {
    const { service, db } = setup();

    await expect(service.create(newPersonBooking('doc-x'), 'u1')).rejects.toThrow(NotFoundException);

    expect(db.rows(CommonPerson)).toHaveLength(0);
    expect(db.rows(Patient)).toHaveLength(0);
  });

  it('a date in the past is rejected before the patient step', async () => {
    const { service, db } = setup();

    await expect(
      service.create({ ...newPersonBooking(), appointmentDate: '2001-01-01T10:00:00Z' }, 'u1'),
    ).rejects.toThrow(BadRequestException);
    expect(db.rows(Patient)).toHaveLength(0);
  });
});
