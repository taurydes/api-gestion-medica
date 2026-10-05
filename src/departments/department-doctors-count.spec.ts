import { createCache } from 'cache-manager';
import { CACHE_TTL, invalidateScope } from 'src/common/cache/cache-registry';
import { DepartmentsService } from './departments.service';

// Real cache-manager (in-memory Keyv), as in cache-invalidation.spec.
const mapCache = () => createCache({ ttl: CACHE_TTL.LIST }) as any;

// Records the count mapping and evaluates its condition against a recording sub-query.
function recordingRepo(rows: () => any[]) {
  const counts: { property: string; relation: string; conditions: string[] }[] = [];
  const qb: any = {
    leftJoinAndSelect: () => qb,
    where: () => qb,
    andWhere: () => qb,
    orderBy: () => qb,
    skip: () => qb,
    take: () => qb,
    loadRelationCountAndMap: (property: string, relation: string, _alias: string, cond: (q: any) => any) => {
      const conditions: string[] = [];
      const sub: any = { andWhere: (c: string) => (conditions.push(c), sub) };
      cond(sub);
      counts.push({ property, relation, conditions });
      return qb;
    },
    getOne: async () => rows()[0] ?? null,
    getManyAndCount: async () => [rows(), rows().length],
  };
  return { repo: { createQueryBuilder: jest.fn(() => qb) } as any, counts };
}

describe('Department doctorsCount', () => {
  it('list and detail map doctorsCount from department.doctors, excluding soft-deleted doctors', async () => {
    const { repo, counts } = recordingRepo(() => [{ id: 'dep-1', doctorsCount: 3 }]);
    const service = new DepartmentsService(repo, {} as any, {} as any, mapCache());

    const list: any = await service.findAll({ page: 1, limit: 10, order: 'ASC' } as any);
    const detail = await service.findOne('dep-1');

    expect(list.data[0].doctorsCount).toBe(3);
    expect(detail.doctorsCount).toBe(3);
    expect(counts).toHaveLength(2);
    for (const c of counts) {
      expect(c).toEqual({
        property: 'department.doctorsCount',
        relation: 'department.doctors',
        conditions: ['doctor.deletedAt IS NULL'],
      });
    }
  });

  it('a cached detail is dropped when the department scope is invalidated (doctor changes do this)', async () => {
    let count = 1;
    const { repo } = recordingRepo(() => [{ id: 'dep-1', doctorsCount: count }]);
    const cache = mapCache();
    const service = new DepartmentsService(repo, {} as any, {} as any, cache);

    expect((await service.findOne('dep-1')).doctorsCount).toBe(1);
    count = 2;
    expect((await service.findOne('dep-1')).doctorsCount).toBe(1);

    await invalidateScope(cache, 'department');
    expect((await service.findOne('dep-1')).doctorsCount).toBe(2);
  });
});
