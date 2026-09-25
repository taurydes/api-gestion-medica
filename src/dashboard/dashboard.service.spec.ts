import { DashboardService } from './dashboard.service';

/** QueryBuilder simulado que registra cada andWhere. */
function fakeQb(result: any[] = []) {
  const calls: string[] = [];
  const qb: any = {
    calls,
    leftJoinAndSelect: () => qb,
    innerJoin: () => qb,
    select: () => qb,
    addSelect: () => qb,
    where: () => qb,
    andWhere: (sql: string) => {
      calls.push(sql);
      return qb;
    },
    groupBy: () => qb,
    orderBy: () => qb,
    take: () => qb,
    getMany: async () => result,
    getRawMany: async () => result,
  };
  return qb;
}

function build(scope: { isAdmin: boolean; doctorId: string | null }) {
  const qb = fakeQb([{ id: 'apt' }]);
  const appointmentRepo = { createQueryBuilder: () => qb };
  const authContext = {
    isAdmin: jest.fn().mockResolvedValue(scope.isAdmin),
    getDoctorIdForUser: jest.fn().mockResolvedValue(scope.doctorId),
  };
  const service = new DashboardService(
    appointmentRepo as any,
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    authContext as any,
  );
  return { service, qb };
}

describe('DashboardService.getRecentAppointments — acotado al usuario (M-10)', () => {
  it('usuario sin perfil de doctor ni permiso de admin (p. ej. enfermero) → no ve citas', async () => {
    const { service, qb } = build({ isAdmin: false, doctorId: null });
    await service.getRecentAppointments({ id: 'u-enf' });
    expect(qb.calls).toContain('1 = 0');
  });

  it('doctor → solo sus citas', async () => {
    const { service, qb } = build({ isAdmin: false, doctorId: 'doc-1' });
    await service.getRecentAppointments({ id: 'u-doc' });
    expect(qb.calls).toContain('a.doctorId = :doctorId');
    expect(qb.calls).not.toContain('1 = 0');
  });

  it('admin → sin filtro', async () => {
    const { service, qb } = build({ isAdmin: true, doctorId: null });
    await service.getRecentAppointments({ id: 'u-admin' });
    expect(qb.calls).toEqual([]);
  });
});
