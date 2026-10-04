import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { authContextForUsers, SCOPE_USERS } from '../../test/auth-context-stub';
import { AppointmentStatus, MedicalAppointment } from './entities/medical-appointment.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { MedicalCenterService } from 'src/medical-center/medical-center.service';
import { Department } from 'src/departments/entities/department.entity';
import { DepartmentsService } from 'src/departments/departments.service';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { PatientService } from 'src/patient/patient.service';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { DoctorSchedule } from 'src/doctors/entities/doctor-schedule.entity';
import { DoctorsService } from 'src/doctors/doctors.service';

const DAY = 24 * 60 * 60 * 1000;
const future = new Date(Date.now() + 7 * DAY);
const past = new Date(Date.now() - 7 * DAY);

/**
 * Manager over the in-memory tables whose appointment query builder applies the same filters as
 * countOpenAppointments: the columns compared with `=` and the open-status/date rule.
 */
function managerFor(db: InMemoryDb) {
  const base = db.dataSource.manager;
  const appointmentQb = () => {
    const equals: Record<string, unknown> = {};
    const qb: any = {
      where: () => qb,
      andWhere: (clause: string, params: Record<string, unknown> = {}) => {
        const column = /^apt\.(\w+) = :\1$/.exec(clause)?.[1];
        if (column) equals[column] = params[column];
        return qb;
      },
      getCount: async () =>
        db.rows(MedicalAppointment).filter((a) =>
          a.deletedAt == null &&
          ((['pending', 'confirmed'].includes(a.status) && a.appointmentDate > new Date()) || a.status === 'in_consultation') &&
          Object.entries(equals).every(([k, v]) => a[k] === v),
        ).length,
    };
    return qb;
  };
  const manager: any = {
    getRepository: (entity: Function) => {
      const repo = base.getRepository(entity);
      if (entity === MedicalAppointment) repo.createQueryBuilder = appointmentQb;
      return repo;
    },
    transaction: async (work: (m: any) => Promise<unknown>) => work(manager),
  };
  return manager;
}

const withManager = (db: InMemoryDb, entity: Function) => Object.assign(db.repo(entity), { manager: managerFor(db) });
const cache = () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn() }) as any;
const apt = (fields: Record<string, unknown>) => ({
  id: `apt-${Math.random()}`, deletedAt: null, status: AppointmentStatus.PENDING, appointmentDate: future, ...fields,
});

function seed(appointments: Record<string, unknown>[] = []) {
  return new InMemoryDb()
    .table(MedicalAppointment, appointments)
    .table(MedicalCenter, [
      { id: 'mc-1', deletedAt: null }, { id: 'mc-2', deletedAt: null }, { id: 'mc-old', deletedAt: new Date('2026-01-01') },
    ])
    .table(Department, [
      { id: 'dep-1', medicalCenterId: 'mc-1', deletedAt: null },
      { id: 'dep-2', medicalCenterId: 'mc-2', deletedAt: null },
    ])
    .table(Specialty, [{ id: 'sp-1', deletedAt: null }])
    .table(Patient, [{ id: 'pat-1', deletedAt: null }])
    .table(Doctor, [{
      id: 'doc-a', deletedAt: null, isActive: true,
      medicalCenters: [{ id: 'mc-1' }, { id: 'mc-2' }],
      departments: [{ id: 'dep-1', medicalCenterId: 'mc-1' }, { id: 'dep-2', medicalCenterId: 'mc-2' }],
    }])
    .table(DoctorSchedule, [
      { id: 'blk-1', doctorId: 'doc-a', medicalCenterId: 'mc-1', isActive: true, deletedAt: null },
      { id: 'blk-2', doctorId: 'doc-a', medicalCenterId: 'mc-2', isActive: true, deletedAt: null },
    ]);
}

const centers = (db: InMemoryDb) =>
  new MedicalCenterService(
    withManager(db, MedicalCenter), {} as any, db.repo(Doctor), db.repo(Department), {} as any, cache(), {} as any, {} as any,
  );
const row = (db: InMemoryDb, entity: Function, id: string) => db.rows(entity).find((r) => r.id === id)!;

describe('Deletes refuse records with open appointments (MJ-12)', () => {
  it('center with a future pending appointment → 409 and it stays', async () => {
    const db = seed([apt({ medicalCenterId: 'mc-1' })]);
    await expect(centers(db).remove('mc-1')).rejects.toThrow(ConflictException);
    expect(row(db, MedicalCenter, 'mc-1').deletedAt).toBeNull();
  });

  it('center whose appointments are past, cancelled or completed → deleted', async () => {
    const db = seed([
      apt({ medicalCenterId: 'mc-1', appointmentDate: past }),
      apt({ medicalCenterId: 'mc-1', status: AppointmentStatus.CANCELLED }),
      apt({ medicalCenterId: 'mc-1', status: AppointmentStatus.COMPLETED }),
    ]);
    await centers(db).remove('mc-1');
    expect(row(db, MedicalCenter, 'mc-1').deletedAt).toBeInstanceOf(Date);
  });

  it('an appointment in consultation counts even if it started in the past', async () => {
    const db = seed([apt({ medicalCenterId: 'mc-1', appointmentDate: past, status: AppointmentStatus.IN_CONSULTATION })]);
    await expect(centers(db).remove('mc-1')).rejects.toThrow('1 cita(s) pendiente(s) o en curso');
  });

  it('department with a future confirmed appointment → 409', async () => {
    const db = seed([apt({ departmentId: 'dep-1', status: AppointmentStatus.CONFIRMED })]);
    const service = new DepartmentsService(withManager(db, Department), db.repo(MedicalCenter), db.repo(Specialty), cache());
    await expect(service.remove('dep-1')).rejects.toThrow(ConflictException);
    expect(row(db, Department, 'dep-1').deletedAt).toBeNull();
  });

  it('patient with a future appointment → 409; without → deleted', async () => {
    const db = seed([apt({ patientId: 'pat-1' })]);
    const deps: any[] = Array(12).fill({});
    deps[0] = withManager(db, Patient);
    deps[9] = cache();
    const service = new (PatientService as any)(...deps) as PatientService;
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'pat-1' } as any);

    await expect(service.remove('pat-1')).rejects.toThrow(ConflictException);
    expect(row(db, Patient, 'pat-1').deletedAt).toBeNull();

    db.rows(MedicalAppointment)[0].status = AppointmentStatus.CANCELLED;
    await service.remove('pat-1');
    expect(row(db, Patient, 'pat-1').deletedAt).toBeInstanceOf(Date);
  });
});

describe('Taking a doctor out of a center cleans their links there (MJ-15)', () => {
  it('open appointment in that center → 409 and nothing changes', async () => {
    const db = seed([apt({ doctorId: 'doc-a', medicalCenterId: 'mc-1' })]);
    jest.spyOn(MedicalCenterService.prototype, 'findOne').mockResolvedValue({} as any);
    const service = centers(db);
    (service as any).medicalCenterRepository.findOne = async () => ({ id: 'mc-1', doctors: [{ id: 'doc-a' }] });

    await expect(service.removeDoctor('mc-1', 'doc-a')).rejects.toThrow(ConflictException);
    expect(row(db, Doctor, 'doc-a').medicalCenters).toHaveLength(2);
    expect(row(db, DoctorSchedule, 'blk-1').deletedAt).toBeNull();
  });

  it('no open appointments there → center, its departments and its schedule blocks go; the rest stays', async () => {
    // An open appointment in the other center does not block this one.
    const db = seed([apt({ doctorId: 'doc-a', medicalCenterId: 'mc-2' })]);
    jest.spyOn(MedicalCenterService.prototype, 'findOne').mockResolvedValue({} as any);
    const service = centers(db);
    (service as any).medicalCenterRepository.findOne = async () => ({ id: 'mc-1', doctors: [{ id: 'doc-a' }] });

    await service.removeDoctor('mc-1', 'doc-a');

    const doctor = row(db, Doctor, 'doc-a');
    expect(doctor.medicalCenters.map((c: any) => c.id)).toEqual(['mc-2']);
    expect(doctor.departments.map((d: any) => d.id)).toEqual(['dep-2']);
    expect(row(db, DoctorSchedule, 'blk-1')).toMatchObject({ isActive: false });
    expect(row(db, DoctorSchedule, 'blk-1').deletedAt).toBeInstanceOf(Date);
    expect(row(db, DoctorSchedule, 'blk-2').deletedAt).toBeNull();
  });

  it('assigning a doctor to a deleted center → 404', async () => {
    const db = seed();
    await expect(centers(db).assignDoctor('mc-old', 'doc-a')).rejects.toThrow(NotFoundException);
  });
});

describe('Doctor centers: unknown ids → 400, only an admin changes them (MJ-13, MJ-17)', () => {
  function doctors(db: InMemoryDb) {
    const service = new DoctorsService(
      withManager(db, Doctor), {} as any, db.repo(Specialty), db.repo(MedicalCenter), {} as any, {} as any,
      cache(), {} as any, authContextForUsers({ ...SCOPE_USERS, 'user-a': { isAdmin: false, doctorId: 'doc-a' } }), {} as any,
    );
    return service;
  }

  it('the doctor adds a center to their own profile → 403, centers unchanged', async () => {
    const db = seed();
    db.rows(Doctor)[0].medicalCenters = [{ id: 'mc-1' }];
    await expect(doctors(db).update('doc-a', { medicalCenterIds: ['mc-1', 'mc-2'] } as any, { id: 'user-a' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(row(db, Doctor, 'doc-a').medicalCenters).toEqual([{ id: 'mc-1' }]);
  });

  it('the doctor round-trips the same centers (edit form) → ok', async () => {
    const db = seed();
    await expect(
      doctors(db).update('doc-a', { medicalCenterIds: ['mc-2', 'mc-1'], licenseNumber: 'L-9' } as any, { id: 'user-a' }),
    ).resolves.toMatchObject({ licenseNumber: 'L-9' });
  });

  it('an admin removing a center also cleans the doctor\'s schedule there', async () => {
    const db = seed();
    await doctors(db).update('doc-a', { medicalCenterIds: ['mc-2'] } as any, { id: 'user-admin' });
    expect(row(db, Doctor, 'doc-a').medicalCenters.map((c: any) => c.id)).toEqual(['mc-2']);
    expect(row(db, DoctorSchedule, 'blk-1').deletedAt).toBeInstanceOf(Date);
  });

  it.each([
    ['an unknown center', { medicalCenterIds: ['mc-1', 'mc-x'] }, 'Centros médicos inexistentes: mc-x.'],
    ['a deleted center', { medicalCenterIds: ['mc-old'] }, 'Centros médicos inexistentes: mc-old.'],
    ['an unknown specialty', { specialtyIds: ['sp-1', 'sp-x'] }, 'Especialidades inexistentes: sp-x.'],
  ])('%s → 400 instead of saving fewer', async (_label, dto, message) => {
    const db = seed();
    await expect(doctors(db).update('doc-a', dto as any, { id: 'user-admin' })).rejects.toThrow(message);
  });

  it('department with an unknown specialty → 400 (create)', async () => {
    const db = seed();
    const service = new DepartmentsService(db.repo(Department), db.repo(MedicalCenter), db.repo(Specialty), cache());
    await expect(
      service.create({ name: 'Mastología', medicalCenterId: 'mc-1', specialtyIds: ['sp-1', 'sp-x'] } as any),
    ).rejects.toThrow(BadRequestException);
    expect(db.rows(Department)).toHaveLength(2);
  });
});
