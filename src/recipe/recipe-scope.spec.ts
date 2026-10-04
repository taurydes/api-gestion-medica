import { ForbiddenException } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { authContextForUsers, SCOPE_USERS } from '../../test/auth-context-stub';
import { RecipeService } from './recipe.service';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';

function setup() {
  const db = new InMemoryDb()
    .table(Patient, [{ id: 'pat-1', deletedAt: null }, { id: 'pat-2', deletedAt: null }])
    .table(Doctor, [{ id: 'doc-a', deletedAt: null }, { id: 'doc-b', deletedAt: null }])
    .table(MedicalHistory, [
      { id: 'his-b', patientId: 'pat-1', doctorId: 'doc-b', medicalAppointmentId: 'apt-b', deletedAt: null },
    ])
    .table(Recipe, [
      { id: 'rec-b', doctorId: 'doc-b', patientId: 'pat-1', medicalHistoryId: 'his-b', status: 'active', notes: 'original', deletedAt: null },
    ])
    .table(RecipeItem);
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };
  const service = new RecipeService(
    db.repo(Recipe),
    db.repo(RecipeItem),
    db.repo(Patient),
    db.repo(Doctor),
    db.repo(MedicalHistory),
    cache as any,
    {} as any,
    {} as any,
    db.dataSource,
    authContextForUsers(SCOPE_USERS),
  );
  const recipe = () => db.rows(Recipe).find((r) => r.id === 'rec-b')!;
  const created = () => db.rows(Recipe).filter((r) => r.id !== 'rec-b');
  return { service, recipe, created };
}

const newRecipe = (extra: object = {}) =>
  ({
    medicalHistoryId: 'his-b', patientId: 'pat-1', doctorId: 'doc-b',
    items: [{ medicationName: 'Ibuprofeno', dosage: '400mg', frequency: '8h', quantity: 1 }],
    ...extra,
  }) as any;

type Write = (s: RecipeService, userId: string) => Promise<unknown>;
const WRITES: Array<[string, Write]> = [
  ['update', (s, u) => s.update('rec-b', { notes: 'cambiada' }, u)],
  ['markAsDispensed', (s, u) => s.markAsDispensed('rec-b', u)],
  ['cancel', (s, u) => s.cancel('rec-b', u)],
  ['remove', (s, u) => s.remove('rec-b', u)],
];

describe('RecipeService — writes limited to the consultation doctor (MJ-28)', () => {
  it.each(WRITES)('%s by doctor A on doctor B recipe → 403 and nothing changes', async (_name, write) => {
    const { service, recipe } = setup();
    const before = { ...recipe() };

    await expect(write(service, 'user-a')).rejects.toThrow(ForbiddenException);

    expect(recipe()).toEqual(before);
  });

  it.each(WRITES)('%s by doctor B on their own recipe → ok', async (_name, write) => {
    const { service, recipe } = setup();
    const before = { ...recipe() };

    await write(service, 'user-b');

    expect(recipe()).not.toEqual(before);
  });

  it.each(WRITES)('%s by an admin → ok', async (_name, write) => {
    const { service, recipe } = setup();
    const before = { ...recipe() };

    await write(service, 'user-admin');

    expect(recipe()).not.toEqual(before);
  });

  it('doctor A creating a recipe on doctor B history → 403, nothing saved', async () => {
    const { service, created } = setup();
    await expect(service.create(newRecipe({ doctorId: 'doc-a' }), 'user-a')).rejects.toThrow(ForbiddenException);
    await expect(service.create(newRecipe(), 'user-a')).rejects.toThrow(ForbiddenException);
    expect(created()).toHaveLength(0);
  });

  it('doctor B creates on their history; admin too', async () => {
    const { service, created } = setup();
    await service.create(newRecipe(), 'user-b');
    await service.create(newRecipe(), 'user-admin');
    expect(created()).toHaveLength(2);
  });

  it('patient, doctor or appointment other than the history → 400 even for an admin', async () => {
    const { service, created } = setup();
    await expect(service.create(newRecipe({ patientId: 'pat-2' }), 'user-admin')).rejects.toThrow(
      'patientId y doctorId deben ser los del historial médico indicado.',
    );
    await expect(service.create(newRecipe({ medicalAppointmentId: 'apt-x' }), 'user-admin')).rejects.toThrow(
      'medicalAppointmentId no corresponde al historial médico indicado.',
    );
    expect(created()).toHaveLength(0);
  });
});
