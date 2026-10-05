import { ForbiddenException } from '@nestjs/common';
import { MammographyAnalysisService } from './mammography-analysis.service';

function build(scopedDoctorId: string | null, record: any = null) {
  const andWhere = jest.fn();
  const qb: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'andWhere') return (...args: any[]) => (andWhere(...args), qb);
        if (prop === 'getMany') return async () => [];
        if (prop === 'getManyAndCount') return async () => [[], 0];
        if (prop === 'clone') return () => qb;
        return () => qb;
      },
    },
  );
  const analysisRepo = {
    createQueryBuilder: () => qb,
    findOne: jest.fn().mockResolvedValue(record),
    save: jest.fn(async (x) => x),
  };
  const config = { get: () => undefined };
  const authContext = { getScopedDoctorId: jest.fn().mockResolvedValue(scopedDoctorId) };
  const service = new MammographyAnalysisService(
    analysisRepo as any,
    {} as any,
    {} as any,
    {} as any,
    config as any,
    authContext as any,
    {} as any,
    {} as any,
  );
  return { service, andWhere, analysisRepo };
}

const scopeSql = expect.stringContaining('appointment.doctorId = :scopeDoctorId');

describe('MammographyAnalysisService — filtro por médico (M-11)', () => {
  it('la bandeja de un médico solo incluye sus análisis', async () => {
    const { service, andWhere } = build('doc-A');
    await service.findTodayInbox({} as any, { id: 'user-A' });
    expect(andWhere).toHaveBeenCalledWith(scopeSql, {
      scopeDoctorId: 'doc-A',
      scopeUserId: 'user-A',
    });
  });

  it('ranking y estadísticas también se acotan', async () => {
    const { service, andWhere } = build('doc-A');
    await service.findRecent({} as any, { id: 'user-A' });
    await service.getDailyStats({}, { id: 'user-A' });
    expect(andWhere.mock.calls.filter(([sql]) => String(sql).includes(':scopeDoctorId'))).toHaveLength(2);
  });

  it('admin o usuario que no es médico: sin filtro', async () => {
    const { service, andWhere } = build(null);
    await service.findTodayInbox({} as any, { id: 'admin' });
    expect(andWhere).not.toHaveBeenCalledWith(scopeSql, expect.anything());
  });

  it('detalle de un análisis de otro médico → 403', async () => {
    const record = { id: 'a1', appointmentId: 'apt', appointment: { doctorId: 'doc-B' }, analyzedBy: 'user-B' };
    const { service } = build('doc-A', record);
    await expect(service.findOne('a1', { id: 'user-A' })).rejects.toThrow(ForbiddenException);
  });

  it('detalle propio (por cita o análisis sin cita registrado por él) → 200', async () => {
    const own = { id: 'a1', appointmentId: 'apt', appointment: { doctorId: 'doc-A' } };
    await expect(build('doc-A', own).service.findOne('a1', { id: 'user-A' })).resolves.toBe(own);

    const standalone = { id: 'a2', appointmentId: null, appointment: null, analyzedBy: 'user-A' };
    await expect(
      build('doc-A', standalone).service.findOne('a2', { id: 'user-A' }),
    ).resolves.toBe(standalone);
  });

  it('marcar revisado un análisis ajeno → 403 sin guardar', async () => {
    const record = { id: 'a1', appointmentId: 'apt', appointment: { doctorId: 'doc-B' } };
    const { service, analysisRepo } = build('doc-A', record);
    await expect(service.markReviewed('a1', {} as any, 'user-A')).rejects.toThrow(ForbiddenException);
    expect(analysisRepo.save).not.toHaveBeenCalled();
  });
});

describe('MammographyAnalysisService — el día de bandeja, ranking e indicadores es la fecha del análisis (H-04)', () => {
  const dateSql = 'analysis.createdAt BETWEEN :start AND :end';
  const day = { start: new Date('2026-10-04T00:00:00.000'), end: new Date('2026-10-04T23:59:59.999') };

  it.each([
    ['bandeja', (s: MammographyAnalysisService) => s.findTodayInbox({ date: '2026-10-04' } as any, { id: 'admin' })],
    ['ranking', (s: MammographyAnalysisService) => s.findRecent({ date: '2026-10-04' } as any, { id: 'admin' })],
    ['indicadores', (s: MammographyAnalysisService) => s.getDailyStats({ date: '2026-10-04' }, { id: 'admin' })],
  ])('%s: filtra por createdAt del análisis y nunca por la fecha de la cita', async (_name, run) => {
    const { service, andWhere } = build(null);
    await run(service);
    expect(andWhere).toHaveBeenCalledWith(dateSql, day);
    const sqls = andWhere.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => sql.includes('appointmentDate'))).toBe(false);
  });

  it('dateFrom/dateTo acotan el rango inclusivo sobre createdAt', async () => {
    const { service, andWhere } = build(null);
    await service.findRecent({ dateFrom: '2026-10-01', dateTo: '2026-10-03' } as any, { id: 'admin' });
    expect(andWhere).toHaveBeenCalledWith(dateSql, {
      start: new Date('2026-10-01T00:00:00.000'),
      end: new Date('2026-10-03T23:59:59.999'),
    });
  });
});
