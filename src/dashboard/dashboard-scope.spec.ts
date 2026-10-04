import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { PERMISSIONS_KEY } from 'src/auth/decorators/permission.decorator';
import { authContextForUsers } from '../../test/auth-context-stub';

const USERS = {
  'user-a': { isAdmin: false, doctorId: 'doc-a' },
  'user-admin': { isAdmin: true, doctorId: null },
  'nurse-1': { isAdmin: false, doctorId: null, centerIds: ['mc-1'] },
  'nurse-0': { isAdmin: false, doctorId: null, centerIds: [] },
};

type Call = [string, ...any[]];

/** Records every builder call per repository; counts come back as 7. */
function recordingRepo(log: Call[]) {
  const qb: any = new Proxy(
    {},
    {
      get: (_t, name: string) => {
        if (name === 'then') return undefined;
        if (name === 'getCount') return async () => 7;
        if (name === 'getMany' || name === 'getRawMany') return async () => [];
        if (name === 'clone') return () => qb;
        return (...args: any[]) => {
          log.push([name, ...args]);
          return qb;
        };
      },
    },
  );
  return { createQueryBuilder: () => qb };
}

function build() {
  const logs: Record<string, Call[]> = {};
  const repo = (name: string) => recordingRepo((logs[name] = []));
  const doctorRepo: any = repo('doctors');
  doctorRepo.findOne = jest.fn().mockResolvedValue({ id: 'doc-a', medicalCenters: [{ id: 'mc-1' }, { id: 'mc-2' }] });
  const service = new DashboardService(
    repo('appointments') as any, repo('patients') as any, doctorRepo, repo('centers') as any,
    repo('departments') as any, repo('recipes') as any, repo('histories') as any, {} as any,
    authContextForUsers(USERS), repo('analyses') as any,
  );
  return { service, logs };
}

const wheres = (log: Call[]) => log.filter(([m]) => m === 'where' || m === 'andWhere');

describe('Dashboard for staff without a doctor profile (MJ-38)', () => {
  it('the nurse sees the appointments of her centers instead of nothing', async () => {
    const { service, logs } = build();
    await service.getRecentAppointments({ id: 'nurse-1' });
    expect(wheres(logs.appointments)).toContainEqual(['andWhere', 'a.medicalCenterId IN (:...scopeCenterIds)', { scopeCenterIds: ['mc-1'] }]);
  });

  it('staff without centers still see nothing', async () => {
    const { service, logs } = build();
    await service.getAppointmentsByStatus({ id: 'nurse-0' });
    expect(wheres(logs.appointments)).toContainEqual(['andWhere', '1 = 0']);
  });

  it('stats for the nurse: scope "centers", her centers and her patients', async () => {
    const { service, logs } = build();
    const stats = await service.getStats({ id: 'nurse-1' });

    expect(stats).toMatchObject({ scope: 'centers', isDoctor: false, medicalCenterIds: ['mc-1'] });
    expect(wheres(logs.patients).some(([, sql]) => String(sql).includes('ma."medical_center_id" IN (:...scopeCenterIds)'))).toBe(true);
    expect(wheres(logs.centers)).toContainEqual(['andWhere', 'mc.id IN (:...ids)', { ids: ['mc-1'] }]);
  });

  it('the dashboard accepts patient.consultar as well as appointments.consultar', () => {
    const required = Reflect.getMetadata(PERMISSIONS_KEY, DashboardController.prototype.getStats);
    expect(required).toEqual(['appointments.consultar', 'patient.consultar']);
  });
});

describe('Dashboard figures bounded and AI analyses counted from analyses (MJ-45)', () => {
  it('a doctor: patients of the patient scope, catalogs of their centers, analyses of their appointments', async () => {
    const { service, logs } = build();
    const stats = await service.getStats({ id: 'user-a' });

    expect(stats.scope).toBe('doctor');
    expect(wheres(logs.patients).some(([, sql]) => String(sql).includes('ma."doctor_id" = :scopeDoctorId'))).toBe(true);
    expect(logs.doctors).toContainEqual(['innerJoin', 'd.medicalCenters', 'dmc', 'dmc.id IN (:...ids)', { ids: ['mc-1', 'mc-2'] }]);
    expect(wheres(logs.departments)).toContainEqual(['andWhere', 'dp.medicalCenterId IN (:...ids)', { ids: ['mc-1', 'mc-2'] }]);
    expect(wheres(logs.analyses)).toContainEqual(['where', 'ma.deletedAt IS NULL']);
    expect(wheres(logs.analyses).some(([, sql]) => String(sql).includes('apt.doctorId = :doctorId'))).toBe(true);
    expect(stats.totalMlAnalyses).toBe(7);
  });

  it('an admin: global figures', async () => {
    const { service, logs } = build();
    const stats = await service.getStats({ id: 'user-admin' });

    expect(stats.scope).toBe('global');
    expect(wheres(logs.centers)).toEqual([['where', 'mc.deletedAt IS NULL']]);
    expect(wheres(logs.patients)).toEqual([['where', 'patient.deletedAt IS NULL']]);
  });
});
