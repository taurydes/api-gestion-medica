import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { authContextForUsers, SCOPE_USERS } from '../../test/auth-context-stub';
import { FakeQueue } from '../../test/fake-queue';
import { DocumentsService } from 'src/documents/documents.service';
import { RecipeController } from './recipe.controller';
import { RecipeService } from './recipe.service';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';

const REC_B = '0b4c8e1d-7a35-4f0e-9a51-2c7e1f3d9b20';

function setup() {
  const db = new InMemoryDb()
    .table(Recipe, [
      {
        id: REC_B,
        doctorId: 'doc-b',
        patientId: 'pat-1',
        medicalHistoryId: 'his-b',
        status: 'active',
        deletedAt: null,
      },
    ])
    .table(RecipeItem);
  const auth = authContextForUsers(SCOPE_USERS);
  const files = {
    getLatestCommonPersonImageUrl: jest.fn(),
    getLatestDoctorImageUrl: jest.fn(),
  };
  const cache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn(),
    del: jest.fn(),
  };
  const recipes = new RecipeService(
    db.repo(Recipe),
    db.repo(RecipeItem),
    db.repo(Patient),
    db.repo(Doctor),
    db.repo(MedicalHistory),
    cache as any,
    {} as any,
    files as any,
    db.dataSource,
    auth,
  );
  const documentsQueue = new FakeQueue('documents');
  const documents = new DocumentsService(
    documentsQueue as any,
    new FakeQueue('email') as any,
    auth,
    {} as any,
  );
  return {
    controller: new RecipeController(recipes, documents, {} as any),
    documentsQueue,
  };
}

describe('POST /recipes/:id/pdf — same scope as reading the recipe', () => {
  it('the recipe doctor gets 202 data {jobId, status: queued}', async () => {
    const { controller, documentsQueue } = setup();
    const result = await controller.requestPdf(REC_B, {
      user: { id: 'user-b' },
    });

    expect(result).toEqual({ jobId: expect.any(String), status: 'queued' });
    expect(documentsQueue.jobs.size).toBe(1);
  });

  it('another doctor gets 403 and nothing is queued', async () => {
    const { controller, documentsQueue } = setup();
    await expect(
      controller.requestPdf(REC_B, { user: { id: 'user-a' } }),
    ).rejects.toThrow(ForbiddenException);
    expect(documentsQueue.jobs.size).toBe(0);
  });

  it('an admin may request it; an unknown recipe is 404', async () => {
    const { controller, documentsQueue } = setup();
    await expect(
      controller.requestPdf(REC_B, { user: { id: 'user-admin' } }),
    ).resolves.toHaveProperty('jobId');
    await expect(
      controller.requestPdf('9c0d2a7e-0000-4000-8000-000000000000', {
        user: { id: 'user-admin' },
      }),
    ).rejects.toThrow(NotFoundException);
    expect(documentsQueue.jobs.size).toBe(1);
  });
});
