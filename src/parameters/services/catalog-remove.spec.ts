import { FakeRepo } from '../../../test/in-memory-db';
import { AllergyService } from './allergy.service';
import { ChronicDiseaseService } from './chronic-disease.service';
import { MedicationService } from './medication.service';

const stale = { id: 'x1', name: 'nombre viejo de caché', description: 'vieja', isActive: true, deletedAt: null };

describe.each([
  ['medication', MedicationService],
  ['allergy', AllergyService],
  ['chronic-disease', ChronicDiseaseService],
])('%s remove with a stale cached copy (H-06)', (_name, Service: any) => {
  it('writes only deletedAt and isActive, never the cached fields', async () => {
    const table = [{ id: 'x1', name: 'Paracetamol', description: 'actual', isActive: true, deletedAt: null }];
    const cache = { get: jest.fn().mockResolvedValue(stale), set: jest.fn(), del: jest.fn() };
    const service = new Service(new FakeRepo(table) as any, cache as any);

    await service.remove('x1');

    expect(table[0]).toMatchObject({ name: 'Paracetamol', description: 'actual', isActive: false });
    expect(table[0].deletedAt).toBeInstanceOf(Date);
  });
});
