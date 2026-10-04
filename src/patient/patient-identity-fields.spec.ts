import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientService } from './patient.service';
import { Patient } from './entities/patient.entity';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { authContextFor } from '../../test/auth-context-stub';
import { GenderService } from 'src/parameters/services/gender.service';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const messages = (metatype: any, body: object): Promise<string[]> =>
  pipe.transform(body, { type: 'body', metatype }).then(
    () => [],
    (e) => e.getResponse().message as string[],
  );
const person = (extra: Record<string, unknown> = {}) => ({
  firstName: 'Ana', lastName: 'Rivas', letter: 'V', documentNumber: '30111222', ...extra,
});

describe('Person birth date and sex (MJ-23)', () => {
  it('a valid date and sex pass', async () => {
    expect(await messages(CreatePatientDto, { commonPerson: person({ birthDate: '1975-04-12', sex: 'F' }) })).toEqual([]);
  });

  it.each([
    [{ birthDate: '12/04/1975' }, 'La fecha de nacimiento debe tener el formato YYYY-MM-DD'],
    [{ birthDate: '2999-01-01' }, 'La fecha de nacimiento no puede ser futura'],
    [{ sex: 'X' }, 'El sexo debe ser F o M'],
  ])('%j → 400', async (extra, message) => {
    expect((await messages(CreatePatientDto, { commonPerson: person(extra) })).join(' ')).toContain(message);
  });

  it('creating a patient stores both on the person', async () => {
    const db = new InMemoryDb().table(CommonPerson).table(Patient);
    const deps: any[] = Array(12).fill({});
    deps[0] = db.repo(Patient);
    deps[1] = db.repo(CommonPerson);
    deps[9] = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    deps[10] = db.dataSource;
    deps[11] = authContextFor({ isAdmin: true, doctorId: null });
    const service = new (PatientService as any)(...deps) as PatientService;
    jest.spyOn(service, 'findOne').mockResolvedValue({} as any);
    const dto = await pipe.transform(
      { commonPerson: person({ birthDate: '1975-04-12', sex: 'F' }) },
      { type: 'body', metatype: CreatePatientDto },
    );

    await service.create(dto, 'u1');

    expect(db.rows(CommonPerson)[0]).toMatchObject({ birthDate: '1975-04-12', sex: 'F' });
  });
});

describe('Marital status is a closed set and catalog errors are in Spanish (MJ-48)', () => {
  it.each(['soltero', 'casado', 'divorciado', 'viudo', 'union_libre'])('%s is accepted', async (status) => {
    expect(await messages(UpdatePatientDto, { maritalStatus: status })).toEqual([]);
  });

  it('free text → 400 listing the allowed values', async () => {
    expect((await messages(UpdatePatientDto, { maritalStatus: 'Casada' })).join(' ')).toContain(
      'El estado civil debe ser uno de: soltero, casado, divorciado, viudo, union_libre',
    );
  });

  it('a missing gender answers in Spanish', async () => {
    const service = new (GenderService as any)({ findOne: jest.fn().mockResolvedValue(null), findOneBy: jest.fn().mockResolvedValue(null) });
    await expect(service.findOne(99)).rejects.toThrow(new NotFoundException('Género no encontrado'));
  });
});
