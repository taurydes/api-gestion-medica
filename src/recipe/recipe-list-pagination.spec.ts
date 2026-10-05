import { RecipeService } from './recipe.service';

/** Query builder stub that records the ORDER BY columns and returns one page with unordered items. */
function recordingQb(rows: any[], total: number) {
  const orderedBy: string[] = [];
  const qb: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'orderBy' || prop === 'addOrderBy')
          return (col: string) => (orderedBy.push(col), qb);
        if (prop === 'getManyAndCount') return async () => [rows, total];
        return () => qb;
      },
    },
  );
  return { qb, orderedBy };
}

describe('RecipeService.findAll — pagination counts recipes, not item rows', () => {
  it('orders only by recipe columns and sorts each recipe items in memory', async () => {
    const rows = [
      {
        id: 'r1',
        items: [{ orderNumber: 3 }, { orderNumber: 1 }, { orderNumber: 2 }],
      },
      { id: 'r2', items: [] },
    ];
    const { qb, orderedBy } = recordingQb(rows, 34);
    const repo = { createQueryBuilder: () => qb };
    const cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
      del: jest.fn(),
    };
    const files = {
      getLatestCommonPersonImageUrl: jest.fn(),
      getLatestDoctorImageUrl: jest.fn(),
    };
    const auth = { getScopedDoctorId: jest.fn().mockResolvedValue(null) };
    const service = new RecipeService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      cache as any,
      {} as any,
      files as any,
      {} as any,
      auth as any,
    );

    const result: any = await service.findAll(
      { page: 1, limit: 10, order: 'DESC' } as any,
      { id: 'user-admin' },
    );

    // An ORDER BY on the joined one-to-many made TypeORM page and count item rows: total 9 for limit 10, 34 real.
    expect(orderedBy.every((col) => col.startsWith('recipe.'))).toBe(true);
    expect(result.total).toBe(34);
    expect(result.data[0].items.map((i: any) => i.orderNumber)).toEqual([
      1, 2, 3,
    ]);
  });
});
