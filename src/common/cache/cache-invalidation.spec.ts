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
import {
  APPOINTMENT_CACHE_REGISTRY,
  CACHE_TTL,
  cacheAndRemember,
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
    await cacheAndRemember(cache, APPOINTMENT_CACHE_REGISTRY, 'appointment:detail:apt-1', { observations: 'old' }, CACHE_TTL.DETAIL);
    await cacheAndRemember(cache, APPOINTMENT_CACHE_REGISTRY, 'appointment:query:{}', { data: [] }, CACHE_TTL.LIST);

    await service.update('apt-1', { observations: 'new' } as any);

    expect(await cache.get('appointment:detail:apt-1')).toBeUndefined();
    expect(await cache.get('appointment:query:{}')).toBeUndefined();
  });

  it('editing a schedule block drops the keys getSchedulesByDoctor wrote', async () => {
    const cache = newCache();
    const block = { id: 'b-1', doctorId: 'doc-1', medicalCenterId: 'mc-1', deletedAt: null };
    const scheduleRepo = {
      find: jest.fn().mockResolvedValue([block]),
      findOne: jest.fn().mockResolvedValue(block),
      save: jest.fn(async (x) => x),
    };
    const service = new DoctorScheduleService(scheduleRepo as any, {} as any, {} as any, cache as any);

    await service.getSchedulesByDoctor('doc-1');
    await service.getSchedulesByDoctor('doc-1', 'mc-1', true);
    await service.removeBlock('b-1');

    await service.getSchedulesByDoctor('doc-1');
    await service.getSchedulesByDoctor('doc-1', 'mc-1', true);
    // Both reads after the delete hit the repository again
    expect(scheduleRepo.find).toHaveBeenCalledTimes(4);
  });

  it('a patient write also drops the cached appointment views that embed the patient', async () => {
    const cache = newCache();
    const service = Object.assign(Object.create(PatientService.prototype), { cacheManager: cache });
    await cacheAndRemember(cache, APPOINTMENT_CACHE_REGISTRY, 'appointment:detail:apt-1', {}, CACHE_TTL.DETAIL);
    await cacheAndRemember(cache, 'patient:query:keys', 'patient:doc:V123', {}, CACHE_TTL.DETAIL);

    await (service as any).clearQueryCache();

    expect(await cache.get('appointment:detail:apt-1')).toBeUndefined();
    expect(await cache.get('patient:doc:V123')).toBeUndefined();
  });

  it('a new medical history drops medical-history:patient:<id>', async () => {
    const cache = newCache();
    const service = Object.assign(Object.create(MedicalHistoryService.prototype), { cacheManager: cache });
    await cache.set('medical-history:patient:pat-1', [], CACHE_TTL.LIST);

    await service.invalidateListCache('pat-1');

    expect(await cache.get('medical-history:patient:pat-1')).toBeUndefined();
  });
});
