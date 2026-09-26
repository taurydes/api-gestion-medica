import { NotFoundException } from '@nestjs/common';
import { FakeRepo } from '../../test/in-memory-db';
import { PatientService } from 'src/patient/patient.service';
import { DoctorsService } from 'src/doctors/doctors.service';
import { RecipeService } from 'src/recipe/recipe.service';
import { DepartmentsService } from 'src/departments/departments.service';

const deleted = () => [{ id: 'x1', deletedAt: new Date('2026-09-01') }];
const cache = () => ({ get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() });

describe('findOne ignores soft-deleted rows (M-22)', () => {
  it('GET /patient/:id of a deleted patient → 404', async () => {
    const service = new PatientService(
      new FakeRepo(deleted()) as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      cache() as any,
    );
    await expect(service.findOne('x1')).rejects.toThrow(NotFoundException);
  });

  it('GET /doctors/:id of a deleted doctor → 404', async () => {
    const service = new DoctorsService(
      new FakeRepo(deleted()) as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      cache() as any,
      {} as any,
      { isAdmin: jest.fn().mockResolvedValue(true) } as any,
    );
    await expect(service.findOne('x1')).rejects.toThrow(NotFoundException);
  });

  it('GET /recipes/:id of a deleted recipe → 404', async () => {
    const service = new RecipeService(
      new FakeRepo(deleted()) as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      cache() as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(service.findOne('x1')).rejects.toThrow(NotFoundException);
  });

  it('departments findOne no longer uses deletedAt: undefined (which filtered nothing)', async () => {
    const service = new DepartmentsService(
      new FakeRepo(deleted()) as any,
      {} as any,
      {} as any,
      cache() as any,
    );
    await expect(service.findOne('x1')).rejects.toThrow(NotFoundException);
  });
});
