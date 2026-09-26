import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { PatientService } from './patient.service';
import { Patient } from './entities/patient.entity';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { CreatePatientDto } from './dto/create-patient.dto';

function setup(patientDeletedAt: Date | null) {
  const db = new InMemoryDb()
    .table(CommonPerson, [{ id: 'cp-1', letter: 'V', documentNumber: '123', deletedAt: null }])
    // The real index is partial (WHERE deleted_at IS NULL); the fake only models the columns.
    .table(Patient, [
      { id: 'pat-old', commonPersonId: 'cp-1', patientCode: 'PAC-2026-00001', deletedAt: patientDeletedAt },
    ]);
  const cache = { get: jest.fn().mockResolvedValue([]), set: jest.fn(), del: jest.fn() };
  const service = new PatientService(
    db.repo(Patient),
    db.repo(CommonPerson),
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    cache as any,
    db.dataSource,
    {} as any,
  );
  jest
    .spyOn(service, 'findOne')
    .mockImplementation(async (id: string) => db.rows(Patient).find((p) => p.id === id) as any);
  return { service, db };
}

const dto = {
  commonPerson: { letter: 'V', documentNumber: '123', firstName: 'Ana', firstLastName: 'Pérez' },
} as unknown as CreatePatientDto;

describe('PatientService.create — re-registering a soft-deleted patient (M-17)', () => {
  it('creates a new active patient when the previous one was deleted', async () => {
    const { service, db } = setup(new Date());

    const created = await service.create(dto, 'u1');

    expect(created.id).not.toBe('pat-old');
    const active = db.rows(Patient).filter((p) => p.commonPersonId === 'cp-1' && p.deletedAt == null);
    expect(active).toHaveLength(1);
  });

  it('an active patient for the same person is still rejected', async () => {
    const { service, db } = setup(null);

    await expect(service.create(dto, 'u1')).rejects.toThrow(BadRequestException);
    expect(db.rows(Patient)).toHaveLength(1);
  });
});

describe('Correo del paciente (fase 2)', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const body = {
    commonPerson: { letter: 'V', documentNumber: '999', firstName: 'Ana', lastName: 'Pérez' },
    email: 'ana@example.com',
  };

  it('POST /patient conserva email y lo guarda en patients.email', async () => {
    const { service, db } = setup(null);
    const validated = await pipe.transform(body, { type: 'body', metatype: CreatePatientDto });

    const created = await service.create(validated, 'u1');

    expect(db.rows(Patient).find((p) => p.id === created.id)?.email).toBe('ana@example.com');
  });

  it('rechaza un correo inválido y convierte "" en null', async () => {
    await expect(
      pipe.transform({ ...body, email: 'no-es-correo' }, { type: 'body', metatype: CreatePatientDto }),
    ).rejects.toThrow(BadRequestException);
    const cleared = await pipe.transform({ ...body, email: '' }, { type: 'body', metatype: CreatePatientDto });
    expect(cleared.email).toBeNull();
  });
});
