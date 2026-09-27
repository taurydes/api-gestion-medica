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
