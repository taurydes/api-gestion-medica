import { ForbiddenException } from '@nestjs/common';
import { FakeRepo } from '../../test/in-memory-db';
import { authContextForUsers, SCOPE_USERS } from '../../test/auth-context-stub';
import { DoctorsService } from './doctors.service';
import { DoctorScheduleService } from './doctor-schedule.service';

const A = { id: 'user-a' };
const B = { id: 'user-b' };
const ADMIN = { id: 'user-admin' };

function doctorsService() {
  const rows = [
    { id: 'doc-a', isActive: true, deletedAt: null, commonPerson: null } as Record<string, any>,
    { id: 'doc-b', isActive: true, deletedAt: null, commonPerson: null },
  ];
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const service = new DoctorsService(
    new FakeRepo(rows) as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    cache as any, {} as any, authContextForUsers(SCOPE_USERS), {} as any,
  );
  jest.spyOn(service as any, 'clearQueryCache').mockResolvedValue(undefined);
  const doctor = (id: string) => rows.find((r) => r.id === id)!;
  return { service, doctor };
}

describe('DoctorsService — only admins remove or (de)activate doctors (MJ-16)', () => {
  it('doctor A removing doctor B → 403 and B stays', async () => {
    const { service, doctor } = doctorsService();
    await expect(service.remove('doc-b', A)).rejects.toThrow(ForbiddenException);
    expect(doctor('doc-b').deletedAt).toBeNull();
  });

  it('doctor B removing doctor A → 403 (the rule is not tied to one doctor)', async () => {
    const { service } = doctorsService();
    await expect(service.remove('doc-a', B)).rejects.toThrow(ForbiddenException);
  });

  it('a doctor cannot remove themselves either → 403', async () => {
    const { service, doctor } = doctorsService();
    await expect(service.remove('doc-a', A)).rejects.toThrow(ForbiddenException);
    expect(doctor('doc-a').deletedAt).toBeNull();
  });

  it('admin removes any doctor', async () => {
    const { service, doctor } = doctorsService();
    await service.remove('doc-b', ADMIN);
    expect(doctor('doc-b').deletedAt).toBeInstanceOf(Date);
  });

  it('doctor A editing doctor B → 403', async () => {
    const { service } = doctorsService();
    await expect(service.update('doc-b', { licenseNumber: 'X' }, A)).rejects.toThrow(ForbiddenException);
  });

  it('doctor A edits their own profile, resending the current isActive', async () => {
    const { service, doctor } = doctorsService();
    await service.update('doc-a', { licenseNumber: 'MPPS-1', isActive: true }, A);
    expect(doctor('doc-a').licenseNumber).toBe('MPPS-1');
  });

  it('doctor A deactivating themselves → 403 and stays active', async () => {
    const { service, doctor } = doctorsService();
    await expect(service.update('doc-a', { isActive: false }, A)).rejects.toThrow(
      'Solo un administrador puede activar o desactivar un médico.',
    );
    expect(doctor('doc-a').isActive).toBe(true);
  });

  it('admin deactivates any doctor', async () => {
    const { service, doctor } = doctorsService();
    await service.update('doc-b', { isActive: false }, ADMIN);
    expect(doctor('doc-b').isActive).toBe(false);
  });
});

describe('DoctorScheduleService — a doctor manages only their own blocks (MJ-18)', () => {
  function scheduleService() {
    const blocks = [
      { id: 'blk-a', doctorId: 'doc-a', medicalCenterId: 'c1', startTime: '08:00:00', endTime: '12:00:00', isActive: true, deletedAt: null },
      { id: 'blk-b', doctorId: 'doc-b', medicalCenterId: 'c1', startTime: '08:00:00', endTime: '12:00:00', isActive: true, deletedAt: null },
    ];
    const doctors = [{ id: 'doc-a', deletedAt: null }, { id: 'doc-b', deletedAt: null }];
    const centers = [{ id: 'c1', deletedAt: null }];
    const cache = { del: jest.fn() };
    const service = new DoctorScheduleService(
      new FakeRepo(blocks) as any,
      new FakeRepo(doctors) as any,
      new FakeRepo(centers) as any,
      cache as any,
      authContextForUsers(SCOPE_USERS),
    );
    const block = (id: string) => blocks.find((b) => b.id === id)!;
    const live = (doctorId: string) => blocks.filter((b) => b.doctorId === doctorId && !b.deletedAt);
    return { service, block, live };
  }
  const schedule = (doctorId: string) => ({
    doctorId,
    medicalCenterId: 'c1',
    blocks: [{ dayOfWeek: 2, startTime: '14:00:00', endTime: '18:00:00' }],
  });

  it('doctor A replacing doctor B schedule → 403 and B keeps the old block', async () => {
    const { service, live } = scheduleService();
    await expect(service.setSchedule(schedule('doc-b'), 'user-a')).rejects.toThrow(ForbiddenException);
    expect(live('doc-b').map((b) => b.id)).toEqual(['blk-b']);
  });

  it('doctor A replaces their own schedule', async () => {
    const { service, live } = scheduleService();
    await service.setSchedule(schedule('doc-a'), 'user-a');
    expect(live('doc-a')).toEqual([expect.objectContaining({ dayOfWeek: 2, startTime: '14:00:00' })]);
  });

  it('admin replaces any schedule', async () => {
    const { service, live } = scheduleService();
    await service.setSchedule(schedule('doc-b'), 'user-admin');
    expect(live('doc-b')).toEqual([expect.objectContaining({ dayOfWeek: 2 })]);
  });

  it('doctor A updating or removing a block of doctor B → 403, block untouched', async () => {
    const { service, block } = scheduleService();
    await expect(service.updateBlock('blk-b', { isActive: false }, 'user-a')).rejects.toThrow(ForbiddenException);
    await expect(service.removeBlock('blk-b', 'user-a')).rejects.toThrow(ForbiddenException);
    expect(block('blk-b')).toMatchObject({ isActive: true, deletedAt: null });
  });

  it('doctor A updates and removes their own block', async () => {
    const { service, block } = scheduleService();
    await service.updateBlock('blk-a', { isActive: false }, 'user-a');
    expect(block('blk-a').isActive).toBe(false);
    await service.removeBlock('blk-a', 'user-a');
    expect(block('blk-a').deletedAt).toBeInstanceOf(Date);
  });

  it('admin updates and removes any block', async () => {
    const { service, block } = scheduleService();
    await service.updateBlock('blk-b', { isActive: false }, 'user-admin');
    await service.removeBlock('blk-b', 'user-admin');
    expect(block('blk-b')).toMatchObject({ isActive: false, deletedAt: expect.any(Date) });
  });

  it('doctor B is limited the same way (the rule is not tied to one doctor)', async () => {
    const { service, block } = scheduleService();
    await expect(service.removeBlock('blk-a', 'user-b')).rejects.toThrow(ForbiddenException);
    expect(block('blk-a').deletedAt).toBeNull();
  });
});
