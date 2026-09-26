import { BadRequestException } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { DoctorsService } from './doctors.service';
import { Doctor } from './entities/doctor.entity';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { PatientService } from 'src/patient/patient.service';
import { Patient } from 'src/patient/entities/patient.entity';
import { Allergy } from 'src/parameters/entities/allergy.entity';

const person = { letter: 'V', documentNumber: '555', firstName: 'Luz', lastName: 'Mar' };
const cache = () => ({ get: jest.fn().mockResolvedValue([]), set: jest.fn(), del: jest.fn() });

function doctors() {
  const db = new InMemoryDb()
    .table(CommonPerson)
    .table(Doctor, [{ id: 'd1', licenseNumber: 'LIC-1', deletedAt: null }], { unique: ['licenseNumber'] })
    .table(Specialty)
    .table(MedicalCenter);
  const service = new DoctorsService(
    db.repo(Doctor),
    db.repo(CommonPerson),
    db.repo(Specialty),
    db.repo(MedicalCenter),
    {} as any,
    {} as any,
    cache() as any,
    {} as any,
    {} as any,
    db.dataSource,
  );
  return { service, db };
}

function patients() {
  const db = new InMemoryDb().table(CommonPerson).table(Patient).table(Allergy);
  const service = new PatientService(
    db.repo(Patient),
    db.repo(CommonPerson),
    db.repo(Allergy),
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    cache() as any,
    db.dataSource,
  );
  return { service, db };
}

describe('Doctor and patient creation leave no orphan person (M-25)', () => {
  it('doctor with a duplicated license → 400 and no new persona_comun row', async () => {
    const { service, db } = doctors();

    await expect(
      service.create({ licenseNumber: 'LIC-1', commonPerson: person } as any),
    ).rejects.toThrow(BadRequestException);
    expect(db.rows(CommonPerson)).toHaveLength(0);
  });

  it('a failure saving the doctor rolls the new person back', async () => {
    const { service, db } = doctors();
    db.failSaves(Doctor, 1);

    await expect(
      service.create({ licenseNumber: 'LIC-2', commonPerson: person } as any),
    ).rejects.toThrow();
    expect(db.rows(CommonPerson)).toHaveLength(0);
  });

  it('a valid doctor writes person and doctor', async () => {
    const { service, db } = doctors();
    await service.create({ licenseNumber: 'LIC-2', commonPerson: person } as any);

    expect(db.rows(CommonPerson)).toHaveLength(1);
    expect(db.rows(Doctor)).toHaveLength(2);
  });

  it('patient with an allergy id that does not exist → 400 and no new person', async () => {
    const { service, db } = patients();

    await expect(
      service.create({ commonPerson: person, allergyIds: ['missing'] } as any),
    ).rejects.toThrow(BadRequestException);
    expect(db.rows(CommonPerson)).toHaveLength(0);
  });

  it('a failure saving the patient rolls the new person back', async () => {
    const { service, db } = patients();
    db.failSaves(Patient, 1);

    await expect(service.create({ commonPerson: person } as any)).rejects.toThrow();
    expect(db.rows(CommonPerson)).toHaveLength(0);
  });
});
