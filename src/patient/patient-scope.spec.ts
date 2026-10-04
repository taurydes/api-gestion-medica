import { ForbiddenException } from '@nestjs/common';
import { PatientService } from './patient.service';
import { authContextForUsers } from '../../test/auth-context-stub';

const USERS = {
  'user-a': { isAdmin: false, doctorId: 'doc-a' },
  'user-admin': { isAdmin: true, doctorId: null },
  'nurse-1': { isAdmin: false, doctorId: null, centerIds: ['mc-1', 'mc-2'] },
  'nurse-0': { isAdmin: false, doctorId: null, centerIds: [] },
};

/** Query builder that records every call, so the test can read the SQL the service asked for. */
function recordingQb(rows: any[] = []) {
  const calls: Array<[string, ...any[]]> = [];
  const qb: any = new Proxy(
    {},
    {
      get: (_t, name: string) => {
        if (name === 'then') return undefined; // not a thenable
        if (name === 'getManyAndCount') return async () => [rows, rows.length];
        if (name === 'getCount') return async () => 0;
        if (name === 'getOne') return async () => rows[0] ?? null;
        return (...args: any[]) => {
          calls.push([name, ...args]);
          return qb;
        };
      },
    },
  );
  return { qb, calls };
}

function build(options: { inScope?: boolean; rows?: any[] } = {}) {
  const { qb, calls } = recordingQb(options.rows);
  const patientRepo = {
    createQueryBuilder: jest.fn(() => qb),
    query: jest.fn().mockResolvedValue(options.inScope ? [{ '?column?': 1 }] : []),
    findOne: jest.fn().mockResolvedValue({ id: 'p1', commonPerson: null, allergies: [], chronicDiseases: [], medications: [] }),
    update: jest.fn(),
    save: jest.fn(async (p) => p),
    manager: {},
  };
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };
  const deps: any[] = Array(12).fill({});
  deps[0] = patientRepo;
  deps[9] = cache;
  deps[11] = authContextForUsers(USERS);
  const service = new (PatientService as any)(...deps) as PatientService;
  return { service, patientRepo, calls };
}

const where = (calls: Array<[string, ...any[]]>) => calls.filter(([m]) => m === 'andWhere' || m === 'where');

describe('Patient list bound by who asks (MJ-20, MJ-02)', () => {
  const query = { page: 1, limit: 10, order: 'ASC' } as any;

  it('a doctor sees the patients of their appointments and the ones they registered', async () => {
    const { service, calls } = build();
    await service.findAll(query, { id: 'user-a' });
    const scope = where(calls).find(([, sql]) => String(sql).includes('scopeUserId'))!;
    expect(scope[1]).toContain('patient.createdBy = :scopeUserId');
    expect(scope[1]).toContain('ma."doctor_id" = :scopeDoctorId');
    expect(scope[2]).toEqual({ scopeUserId: 'user-a', scopeDoctorId: 'doc-a' });
  });

  it('a nurse sees the patients with appointments in her centers and the ones she registered', async () => {
    const { service, calls } = build();
    await service.findAll(query, { id: 'nurse-1' });
    const scope = where(calls).find(([, sql]) => String(sql).includes('scopeUserId'))!;
    expect(scope[1]).toContain('ma."medical_center_id" IN (:...scopeCenterIds)');
    expect(scope[2]).toEqual({ scopeUserId: 'nurse-1', scopeCenterIds: ['mc-1', 'mc-2'] });
  });

  it('staff without centers only see the patients they registered', async () => {
    const { service, calls } = build();
    await service.findAll(query, { id: 'nurse-0' });
    const scope = where(calls).find(([, sql]) => String(sql).includes('scopeUserId'))!;
    expect(scope[1]).toBe('(patient.createdBy = :scopeUserId OR FALSE)');
  });

  it('an admin is not bound', async () => {
    const { service, calls } = build();
    await service.findAll(query, { id: 'user-admin' });
    expect(where(calls).some(([, sql]) => String(sql).includes('scopeUserId'))).toBe(false);
  });
});

describe('Patient list filter and order (MJ-22)', () => {
  it('isActive filters and the order is surname, name, then id', async () => {
    const { service, calls } = build();
    await service.findAll({ page: 1, limit: 10, order: 'DESC', isActive: false } as any, { id: 'user-admin' });

    expect(where(calls)).toContainEqual(['andWhere', 'patient.isActive = :isActive', { isActive: false }]);
    expect(calls.filter(([m]) => m === 'orderBy' || m === 'addOrderBy')).toEqual([
      ['orderBy', 'commonPerson.lastName', 'DESC'],
      ['addOrderBy', 'commonPerson.firstName', 'DESC'],
      ['addOrderBy', 'patient.id', 'ASC'],
    ]);
  });
});

describe('Patient writes follow the read rule (MJ-21)', () => {
  it.each([
    ['update', (s: PatientService) => s.update('p1', { occupation: 'x' } as any, 'user-a')],
    ['remove', (s: PatientService) => s.remove('p1', 'user-a')],
  ])('%s by a doctor outside the patient → 403 and nothing is written', async (_label, write) => {
    const { service, patientRepo } = build({ inScope: false });
    await expect(write(service)).rejects.toThrow(ForbiddenException);
    expect(patientRepo.update).not.toHaveBeenCalled();
    expect(patientRepo.save).not.toHaveBeenCalled();
  });

  it('the scope check passes the doctor, user and patient to the query', async () => {
    const { service, patientRepo } = build({ inScope: false });
    await expect(service.remove('p1', 'user-a')).rejects.toThrow(ForbiddenException);
    expect(patientRepo.query).toHaveBeenCalledWith(expect.stringContaining('p.created_by = $2'), ['p1', 'user-a', 'doc-a']);
  });

  it('an admin is not checked', async () => {
    const { service, patientRepo } = build({ inScope: false });
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'p1' } as any);
    (patientRepo as any).manager = {
      getRepository: () => ({ createQueryBuilder: () => recordingQb().qb }),
    };
    await service.remove('p1', 'user-admin');
    expect(patientRepo.query).not.toHaveBeenCalled();
    expect(patientRepo.update).toHaveBeenCalledWith('p1', expect.objectContaining({ isActive: false }));
  });
});

describe('GET /patient/by-document identifies without clinical data (MJ-21)', () => {
  it('skips deleted patients and does not join allergies, diseases or medications', async () => {
    const { service, calls } = build({ rows: [{ id: 'p1' }] });
    await service.findByDocumentNumber('12345678', 'V');

    expect(where(calls)).toContainEqual(['andWhere', 'patient.deletedAt IS NULL']);
    const joins = calls.filter(([m]) => m === 'leftJoinAndSelect').map(([, rel]) => rel);
    expect(joins).toEqual(['patient.commonPerson']);
  });
});
