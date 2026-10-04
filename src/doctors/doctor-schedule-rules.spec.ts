import { InMemoryDb } from '../../test/in-memory-db';
import { authContextFor } from '../../test/auth-context-stub';
import { DoctorScheduleService } from './doctor-schedule.service';
import { DoctorSchedule } from './entities/doctor-schedule.entity';
import { Doctor } from './entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';

function setup() {
  const db = new InMemoryDb()
    .table(Doctor, [{ id: 'doc-1', deletedAt: null, medicalCenters: [{ id: 'c1' }, { id: 'c2' }] }])
    .table(MedicalCenter, [{ id: 'c1', deletedAt: null }, { id: 'c2', deletedAt: null }])
    .table(DoctorSchedule, [
      // Monday 08–12 in c1 and Tuesday 14–18 in c2
      { id: 'mon-c1', doctorId: 'doc-1', medicalCenterId: 'c1', dayOfWeek: 1, startTime: '08:00:00', endTime: '12:00:00', isActive: true, deletedAt: null },
      { id: 'tue-c2', doctorId: 'doc-1', medicalCenterId: 'c2', dayOfWeek: 2, startTime: '14:00:00', endTime: '18:00:00', isActive: true, deletedAt: null },
    ]);
  const service = new DoctorScheduleService(
    db.repo(DoctorSchedule),
    db.repo(Doctor),
    db.repo(MedicalCenter),
    { del: jest.fn() } as any,
    authContextFor({ isAdmin: true, doctorId: null }),
    db.dataSource,
  );
  const live = (center?: string) =>
    db.rows(DoctorSchedule).filter((b) => !b.deletedAt && (!center || b.medicalCenterId === center));
  return { service, db, live };
}

const block = (dayOfWeek: number, startTime: string, endTime: string) => ({ dayOfWeek, startTime, endTime });

describe('Schedule blocks may not overlap, in any center (MJ-19)', () => {
  it('two new blocks of the same day that overlap → 400 and the old schedule stays', async () => {
    const { service, live } = setup();
    const dto = { doctorId: 'doc-1', medicalCenterId: 'c1', blocks: [block(3, '08:00:00', '12:00:00'), block(3, '11:00:00', '13:00:00')] };

    await expect(service.setSchedule(dto)).rejects.toThrow('se solapa con otro bloque del médico (08:00–12:00)');
    expect(live('c1').map((b) => b.id)).toEqual(['mon-c1']);
  });

  it('a block overlapping one of another center → 400 (the doctor cannot be in two places)', async () => {
    const { service } = setup();
    const dto = { doctorId: 'doc-1', medicalCenterId: 'c1', blocks: [block(2, '17:00:00', '19:00:00')] };

    await expect(service.setSchedule(dto)).rejects.toThrow('El bloque Martes 17:00–19:00 se solapa');
  });

  it('the blocks being replaced do not count, and back-to-back blocks are fine', async () => {
    const { service, live } = setup();
    const dto = { doctorId: 'doc-1', medicalCenterId: 'c1', blocks: [block(1, '09:00:00', '13:00:00'), block(2, '08:00:00', '14:00:00')] };

    await service.setSchedule(dto);

    expect(live('c1').map((b) => [b.dayOfWeek, b.startTime, b.endTime])).toEqual([[1, '09:00:00', '13:00:00'], [2, '08:00:00', '14:00:00']]);
  });

  it('editing a block onto another block of the same day → 400; the block stays as it was', async () => {
    const { service, db } = setup();

    await expect(service.updateBlock('tue-c2', { dayOfWeek: 1, startTime: '10:00:00', endTime: '15:00:00' })).rejects.toThrow('se solapa');
    expect(db.rows(DoctorSchedule).find((b) => b.id === 'tue-c2')).toMatchObject({ dayOfWeek: 2, startTime: '14:00:00' });

    await expect(service.updateBlock('tue-c2', { startTime: '13:00:00' })).resolves.toMatchObject({ startTime: '13:00:00' });
  });
});

describe('Replacing a schedule is atomic (MJ-19)', () => {
  it('a failure while saving the new blocks keeps the previous blocks live', async () => {
    const { service, db, live } = setup();
    db.failSaves(DoctorSchedule, 1);

    await expect(
      service.setSchedule({ doctorId: 'doc-1', medicalCenterId: 'c1', blocks: [block(4, '08:00:00', '12:00:00')] }),
    ).rejects.toThrow('simulated database failure');

    expect(live('c1').map((b) => b.id)).toEqual(['mon-c1']);
  });
});
