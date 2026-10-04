import { ValidationPipe } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { Department } from './entities/department.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { mapDepartment } from 'src/medical-appointments/dto/appointment-response.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any;

function build() {
  const db = new InMemoryDb()
    .table(Department, [{ id: 'dep-1', name: 'Mastología', medicalCenterId: 'mc-1', supportsMammography: true, deletedAt: null }])
    .table(MedicalCenter, [{ id: 'mc-1', deletedAt: null }])
    .table(Specialty);
  const service = new DepartmentsService(db.repo(Department), db.repo(MedicalCenter), db.repo(Specialty), cache);
  jest.spyOn(service, 'findOne').mockImplementation(async (id) => db.rows(Department).find((d) => d.id === id) as any);
  return { service, db };
}

describe('Department flag for the AI tab, independent of the name (MJ-14)', () => {
  it('create stores supportsMammography from the body (validated as boolean)', async () => {
    const { service, db } = build();
    const dto = await pipe.transform(
      { name: 'Imagenología', medicalCenterId: '9b2f1c3e-1111-4a2b-8c3d-000000000001', supportsMammography: true },
      { type: 'body', metatype: CreateDepartmentDto },
    );
    db.rows(MedicalCenter)[0].id = dto.medicalCenterId;

    await service.create(dto, 'admin');

    expect(db.rows(Department).find((d) => d.name === 'Imagenología')).toMatchObject({ supportsMammography: true });
  });

  it('renaming keeps the flag: the name no longer decides', async () => {
    const { service, db } = build();
    const dto = await pipe.transform({ name: 'Unidad de mama' }, { type: 'body', metatype: UpdateDepartmentDto });

    await service.update('dep-1', dto, 'admin');

    expect(db.rows(Department)[0]).toMatchObject({ name: 'Unidad de mama', supportsMammography: true });
  });

  it('a non-boolean value → 400', async () => {
    await expect(
      pipe.transform({ supportsMammography: 'sí' }, { type: 'body', metatype: UpdateDepartmentDto }),
    ).rejects.toThrow();
  });

  it('the appointment detail carries the flag of its department', () => {
    expect(mapDepartment({ id: 'dep-1', name: 'Mastología', supportsMammography: true })).toEqual({
      id: 'dep-1', name: 'Mastología', supportsMammography: true,
    });
    expect(mapDepartment({ id: 'dep-2', name: 'Cardiología' })?.supportsMammography).toBe(false);
  });
});
