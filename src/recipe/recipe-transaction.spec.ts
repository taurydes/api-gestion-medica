import { NotFoundException } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { RecipeService } from './recipe.service';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { Medication } from 'src/parameters/entities/medication.entity';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';

const MISSING_MEDICATION = '5b0f6a55-4a0e-4c1a-9f5e-000000000000';

function setup() {
  const db = new InMemoryDb()
    .table(Patient, [{ id: 'pat-1', deletedAt: null }])
    .table(Doctor, [{ id: 'doc-1', deletedAt: null }])
    .table(MedicalHistory, [{ id: 'mh-1', deletedAt: null }])
    .table(Medication, [{ id: 'med-1', deletedAt: null }])
    .table(Recipe, [
      { id: 'rec-1', status: 'active', patientId: 'pat-1', medicalHistoryId: 'mh-1', deletedAt: null },
    ])
    .table(RecipeItem, [{ id: 'item-old', recipeId: 'rec-1', medicationName: 'Anterior' }]);

  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };
  const service = new RecipeService(
    db.repo(Recipe),
    db.repo(RecipeItem),
    db.repo(Patient),
    db.repo(Doctor),
    db.repo(MedicalHistory),
    cache as any,
    {} as any,
    { getLatestCommonPersonImageUrl: jest.fn(), getLatestDoctorImageUrl: jest.fn() } as any,
    db.dataSource,
    {} as any,
  );
  return { service, db };
}

const item = (medicationId?: string) => ({
  medicationId,
  medicationName: 'Ibuprofeno',
  dosage: '400mg',
  frequency: '8h',
  quantity: 10,
});

const createDto = (medicationId?: string) =>
  ({ medicalHistoryId: 'mh-1', patientId: 'pat-1', doctorId: 'doc-1', items: [item(medicationId)] }) as CreateRecipeDto;

describe('RecipeService — atomic create and update (M-15)', () => {
  it('create with a missing medicationId → 404 and no new recipe for that history', async () => {
    const { service, db } = setup();

    await expect(service.create(createDto(MISSING_MEDICATION), 'u1')).rejects.toThrow(
      NotFoundException,
    );
    expect(db.rows(Recipe)).toHaveLength(1);
  });

  it('create that fails while saving items leaves no header behind', async () => {
    const { service, db } = setup();
    db.failSaves(RecipeItem, 1);

    await expect(service.create(createDto('med-1'), 'u1')).rejects.toThrow();
    expect(db.rows(Recipe)).toHaveLength(1);
  });

  it('create writes header and items together', async () => {
    const { service, db } = setup();
    await service.create(createDto('med-1'), 'u1');

    expect(db.rows(Recipe)).toHaveLength(2);
    expect(db.rows(RecipeItem)).toHaveLength(2);
  });

  it('create against a soft-deleted history → 404 (M-22)', async () => {
    const { service, db } = setup();
    db.rows(MedicalHistory)[0].deletedAt = new Date();

    await expect(service.create(createDto(), 'u1')).rejects.toThrow(NotFoundException);
    expect(db.rows(Recipe)).toHaveLength(1);
  });

  it('update whose item save fails keeps the previous items', async () => {
    const { service, db } = setup();
    db.failSaves(RecipeItem, 1);

    await expect(
      service.update('rec-1', { items: [item('med-1')] } as UpdateRecipeDto, 'u1'),
    ).rejects.toThrow();
    expect(db.rows(RecipeItem).map((i) => i.id)).toEqual(['item-old']);
  });

  it('update with a missing medicationId → 404 before deleting anything', async () => {
    const { service, db } = setup();

    await expect(
      service.update('rec-1', { items: [item(MISSING_MEDICATION)] } as UpdateRecipeDto, 'u1'),
    ).rejects.toThrow(NotFoundException);
    expect(db.rows(RecipeItem).map((i) => i.id)).toEqual(['item-old']);
  });
});
