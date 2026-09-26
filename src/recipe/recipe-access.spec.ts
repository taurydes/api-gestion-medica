import { RecipeService } from './recipe.service';

function build(doctorId: string | null) {
  const recipes = [
    { id: 'r1', doctorId: 'doc-A' },
    { id: 'r2', doctorId: 'doc-B' },
  ];
  const recipeRepo = { find: jest.fn().mockResolvedValue(recipes) };
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
  const userRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'u1', commonPerson: { id: 'cp1' } }),
  };
  const doctorRepo = { findOne: jest.fn().mockResolvedValue(doctorId ? { id: doctorId } : null) };
  const service = new RecipeService(
    recipeRepo as any,
    {} as any,
    {} as any,
    doctorRepo as any,
    {} as any,
    cache as any,
    userRepo as any,
    {} as any,
    {} as any,
  );
  return { service, cache };
}

describe('RecipeService.findByMedicalHistory — filtro por médico (M-11)', () => {
  it('un médico solo recibe sus recetas del historial', async () => {
    const { service } = build('doc-A');
    const result = await service.findByMedicalHistory('mh1', { id: 'u1' });
    expect(result.map((r) => r.id)).toEqual(['r1']);
  });

  it('también filtra cuando la respuesta sale de la caché', async () => {
    const { service, cache } = build('doc-A');
    cache.get.mockResolvedValue([{ id: 'r9', doctorId: 'doc-B' }]);
    await expect(service.findByMedicalHistory('mh1', { id: 'u1' })).resolves.toEqual([]);
  });

  it('un usuario que no es médico ve todas', async () => {
    const { service } = build(null);
    const result = await service.findByMedicalHistory('mh1', { id: 'u1' });
    expect(result).toHaveLength(2);
  });
});
