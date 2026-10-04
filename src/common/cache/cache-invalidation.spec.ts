import { createCache } from 'cache-manager';
import { InMemoryDb } from '../../../test/in-memory-db';
import { MedicalAppointmentsService } from 'src/medical-appointments/medical-appointments.service';
import {
  AppointmentStatus,
  MedicalAppointment,
} from 'src/medical-appointments/entities/medical-appointment.entity';
import { DoctorScheduleService } from 'src/doctors/doctor-schedule.service';
import { PatientService } from 'src/patient/patient.service';
import { MedicalHistoryService } from 'src/medical-history/medical-history.service';
import { DepartmentsService } from 'src/departments/departments.service';
import { AllergyService } from 'src/parameters/services/allergy.service';
import { SpecialtyService } from 'src/parameters/services/specialty.service';
import { MedicationService } from 'src/parameters/services/medication.service';
import { MedicalCenterService } from 'src/medical-center/medical-center.service';
import { DoctorsService } from 'src/doctors/doctors.service';
import { CommonPersonService } from 'src/common-person/common-person.service';
import {
  APPOINTMENT_CACHE_SCOPE,
  CACHE_TTL,
  getScoped,
  invalidateScope,
  setScoped,
} from './cache-registry';

// Real cache-manager v7 (in-memory Keyv): the same get/set/del semantics as the Redis store.
const newCache = () => createCache({ ttl: CACHE_TTL.LIST });

describe('Cache invalidation keys (M-56)', () => {
  it('PATCH of an appointment drops appointment:detail:<id> and the lists', async () => {
    const cache = newCache();
    const db = new InMemoryDb().table(MedicalAppointment, [
      { id: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', status: AppointmentStatus.PENDING, deletedAt: null },
    ]);
    const service = new MedicalAppointmentsService(
      db.repo(MedicalAppointment),
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      cache as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    // The reload joins many relations; it is not what this test is about.
    jest.spyOn(service as any, 'loadFullAppointment').mockResolvedValue({});
    await setScoped(cache, APPOINTMENT_CACHE_SCOPE, 'appointment:detail:apt-1', { observations: 'old' }, CACHE_TTL.DETAIL);
    await setScoped(cache, APPOINTMENT_CACHE_SCOPE, 'appointment:query:{}', { data: [] }, CACHE_TTL.LIST);

    await service.update('apt-1', { observations: 'new' } as any);

    expect(await getScoped(cache, APPOINTMENT_CACHE_SCOPE, 'appointment:detail:apt-1')).toBeUndefined();
    expect(await getScoped(cache, APPOINTMENT_CACHE_SCOPE, 'appointment:query:{}')).toBeUndefined();
  });

  it('editing a schedule block drops the keys getSchedulesByDoctor wrote', async () => {
    const cache = newCache();
    const block = { id: 'b-1', doctorId: 'doc-1', medicalCenterId: 'mc-1', deletedAt: null };
    const scheduleRepo = {
      find: jest.fn().mockResolvedValue([block]),
      findOne: jest.fn().mockResolvedValue(block),
      save: jest.fn(async (x) => x),
    };
    const service = new DoctorScheduleService(scheduleRepo as any, {} as any, {} as any, cache as any, {} as any);

    await service.getSchedulesByDoctor('doc-1');
    await service.getSchedulesByDoctor('doc-1', 'mc-1', true);
    await service.removeBlock('b-1');

    await service.getSchedulesByDoctor('doc-1');
    await service.getSchedulesByDoctor('doc-1', 'mc-1', true);
    // Both reads after the delete hit the repository again
    expect(scheduleRepo.find).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['doctor', DoctorsService],
    ['specialty', SpecialtyService],
    ['person', CommonPersonService],
  ])('a %s write drops the cached center list and detail (M-63)', async (_name, Service: any) => {
    const cache = newCache();
    const service = Object.assign(Object.create(Service.prototype), { cacheManager: cache });
    await setScoped(cache, 'medicalCenter', 'medicalCenter:mc-1', { doctors: [{}] }, CACHE_TTL.DETAIL);
    await setScoped(cache, 'medicalCenter', 'medicalCenter:query:{}', { data: [] }, CACHE_TTL.LIST);

    await service.clearQueryCache();

    expect(await getScoped(cache, 'medicalCenter', 'medicalCenter:mc-1')).toBeUndefined();
    expect(await getScoped(cache, 'medicalCenter', 'medicalCenter:query:{}')).toBeUndefined();
  });

  it('a patient write also drops the cached appointment views that embed the patient', async () => {
    const cache = newCache();
    const service = Object.assign(Object.create(PatientService.prototype), { cacheManager: cache });
    await setScoped(cache, APPOINTMENT_CACHE_SCOPE, 'appointment:detail:apt-1', {}, CACHE_TTL.DETAIL);
    await setScoped(cache, 'patient', 'patient:doc:V123', {}, CACHE_TTL.DETAIL);

    await (service as any).clearQueryCache();

    expect(await getScoped(cache, APPOINTMENT_CACHE_SCOPE, 'appointment:detail:apt-1')).toBeUndefined();
    expect(await getScoped(cache, 'patient', 'patient:doc:V123')).toBeUndefined();
  });

  it('a new medical history drops medical-history:patient:<id>', async () => {
    const cache = newCache();
    const service = Object.assign(Object.create(MedicalHistoryService.prototype), { cacheManager: cache });
    await setScoped(cache, 'medical-history', 'medical-history:patient:pat-1', [], CACHE_TTL.LIST);

    await service.invalidateListCache();

    expect(await getScoped(cache, 'medical-history', 'medical-history:patient:pat-1')).toBeUndefined();
  });

  it('a department write drops the center list (counts) and center details (embedded departments)', async () => {
    const cache = newCache();
    const service = Object.assign(Object.create(DepartmentsService.prototype), { cacheManager: cache });
    await setScoped(cache, 'medicalCenter', 'medicalCenter:query:{}', {}, CACHE_TTL.LIST);
    await setScoped(cache, 'medicalCenter', 'medicalCenter:mc-1', {}, CACHE_TTL.DETAIL);

    await (service as any).clearQueryCache();

    expect(await getScoped(cache, 'medicalCenter', 'medicalCenter:query:{}')).toBeUndefined();
    expect(await getScoped(cache, 'medicalCenter', 'medicalCenter:mc-1')).toBeUndefined();
  });

  it('editing a catalog (allergy) drops appointment and patient views that embed it', async () => {
    const cache = newCache();
    const service = Object.assign(Object.create(AllergyService.prototype), { cacheManager: cache });
    await setScoped(cache, APPOINTMENT_CACHE_SCOPE, 'appointment:detail:apt-1', {}, CACHE_TTL.DETAIL);
    await setScoped(cache, 'patient', 'patient:pat-1', {}, CACHE_TTL.DETAIL);

    await (service as any).clearQueryCache();

    expect(await getScoped(cache, APPOINTMENT_CACHE_SCOPE, 'appointment:detail:apt-1')).toBeUndefined();
    expect(await getScoped(cache, 'patient', 'patient:pat-1')).toBeUndefined();
  });

  it('concurrent writers cannot lose an invalidation: one write per scope, no read-modify-write', async () => {
    const cache = newCache();
    // 50 list entries cached concurrently (a registry array would race and drop some)
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        setScoped(cache, APPOINTMENT_CACHE_SCOPE, `appointment:query:${i}`, { i }, CACHE_TTL.LIST),
      ),
    );

    await invalidateScope(cache, APPOINTMENT_CACHE_SCOPE);

    const survivors = await Promise.all(
      Array.from({ length: 50 }, (_, i) => getScoped(cache, APPOINTMENT_CACHE_SCOPE, `appointment:query:${i}`)),
    );
    expect(survivors.filter((v) => v !== undefined)).toHaveLength(0);
  });

  it.each([
    ['specialty', SpecialtyService, ['doctor:d-1', 'medical-history:h-1']],
    ['medical center', MedicalCenterService, ['doctor:d-1', 'medical-history:h-1']],
    ['medication', MedicationService, ['recipe:r-1', 'recipe:medical-history:h-1']],
  ])('a %s write drops the doctor/recipe/history details that embed it', async (_name, Service: any, keys) => {
    const cache = newCache();
    const scopeOf = (key: string) => key.split(':')[0] === 'recipe' ? 'recipe' : key.split(':')[0];
    for (const key of keys) await setScoped(cache, scopeOf(key), key, {}, CACHE_TTL.DETAIL);
    const service = Object.assign(Object.create(Service.prototype), { cacheManager: cache });

    await (service as any).clearQueryCache();

    for (const key of keys) expect(await getScoped(cache, scopeOf(key), key)).toBeUndefined();
  });
});
