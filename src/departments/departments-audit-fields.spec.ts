import { InMemoryDb } from '../../test/in-memory-db';
import { Department } from './entities/department.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { DepartmentsService } from './departments.service';
import { DepartmentsController } from './departments.controller';

const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any;

/** Real controller and service: the actor from the JWT must land in createdBy / updatedBy. */
function build() {
  const db = new InMemoryDb()
    .table(Department, [{ id: 'dep-1', name: 'Mastología', medicalCenterId: 'mc-1', deletedAt: null }])
    .table(MedicalCenter, [{ id: 'mc-1', deletedAt: null }])
    .table(Specialty);
  const service = new DepartmentsService(db.repo(Department), db.repo(MedicalCenter), db.repo(Specialty), cache);
  jest.spyOn(service, 'findOne').mockImplementation(async (id) => db.rows(Department).find((d) => d.id === id) as any);
  return { controller: new DepartmentsController(service), db };
}

describe('Departments record who created and updated them', () => {
  it('POST stores createdBy from the session user', async () => {
    const { controller, db } = build();
    await controller.create({ name: 'Radiología', medicalCenterId: 'mc-1' } as any, 'admin-1');
    expect(db.rows(Department).find((d) => d.name === 'Radiología')).toMatchObject({ createdBy: 'admin-1' });
  });

  it('PATCH stores updatedBy from the session user', async () => {
    const { controller, db } = build();
    await controller.update('dep-1', { name: 'Mastología y Mama' } as any, 'admin-2');
    expect(db.rows(Department).find((d) => d.id === 'dep-1')).toMatchObject({ updatedBy: 'admin-2' });
  });
});
