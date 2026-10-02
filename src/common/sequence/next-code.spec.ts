import { RecipeService } from 'src/recipe/recipe.service';
import { CODE_SEQUENCES, nextCode } from './next-code';

describe('Codes from a database sequence (M-63)', () => {
  it('formats <PREFIX>-<YYYY>-<NNNNN> from nextval of its own sequence', async () => {
    const runner = { query: jest.fn().mockResolvedValue([{ value: '42' }]) };

    const code = await nextCode(runner, 'APT');

    expect(code).toBe(`APT-${new Date().getFullYear()}-00042`);
    expect(runner.query).toHaveBeenCalledWith(
      `SELECT nextval('${CODE_SEQUENCES.APT}') AS value`,
    );
  });

  it('concurrent recipes get distinct numbers (no read-max-then-add-one)', async () => {
    let next = 0;
    // A max+1 generator would read the same max twice here; nextval never repeats
    const repo = { query: jest.fn(async () => [{ value: String(++next) }]), createQueryBuilder: jest.fn() };
    const service = Object.assign(Object.create(RecipeService.prototype), { recipeRepository: repo });

    const [a, b] = await Promise.all([
      (service as any).generateRecipeNumber(),
      (service as any).generateRecipeNumber(),
    ]);

    expect(a).not.toBe(b);
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
