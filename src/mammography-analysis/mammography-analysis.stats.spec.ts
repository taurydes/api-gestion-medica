import { MammographyAnalysisService } from './mammography-analysis.service';

function build(rows: any[]) {
  const andWhere = jest.fn();
  const qb: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'andWhere') return (...args: any[]) => (andWhere(...args), qb);
        if (prop === 'getMany') return async () => rows;
        if (prop === 'getManyAndCount') return async () => [rows, rows.length];
        return () => qb;
      },
    },
  );
  const service = new MammographyAnalysisService(
    { createQueryBuilder: () => qb } as any,
    {} as any,
    {} as any,
    {} as any,
    { get: () => undefined } as any,
    { getScopedDoctorId: jest.fn().mockResolvedValue(null) } as any,
    {} as any,
    {} as any,
  );
  return { service, andWhere };
}

describe('Semántica de malignidad en estadísticas y filtros (M-40)', () => {
  it('highRisk cuenta la probabilidad de malignidad, no la confianza en la clase', async () => {
    const rows = [
      { status: 'danger', probability: 96.19, malignancyProbability: 96.19, isReviewed: false },
      // Benigno con 99,5 % de confianza: antes contaba como alto riesgo.
      { status: 'success', probability: 99.5, malignancyProbability: 0.5, isReviewed: true },
      { status: 'success', probability: 35.6, malignancyProbability: 64.4, isReviewed: false },
    ];
    const stats = await build(rows).service.getDailyStats({}, { id: 'admin' });
    expect(stats).toMatchObject({ total: 3, danger: 1, pending: 2, highRisk: 1 });
  });

  it('minProbability filtra por malignancyProbability en bandeja y ranking', async () => {
    const { service, andWhere } = build([]);
    await service.findTodayInbox({ minProbability: 80 } as any, { id: 'admin' });
    await service.findRecent({ minProbability: 80 } as any, { id: 'admin' });
    const calls = andWhere.mock.calls.filter(([sql]) => String(sql).includes(':minProbability'));
    expect(calls).toHaveLength(2);
    for (const [sql, params] of calls) {
      expect(sql).toBe('analysis.malignancyProbability >= :minProbability');
      expect(params).toEqual({ minProbability: 80 });
    }
  });
});
