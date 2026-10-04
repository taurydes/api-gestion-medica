import { NotFoundException } from '@nestjs/common';
import { FakeRepo } from '../../test/in-memory-db';
import { MedicalCenterService } from './medical-center.service';

/** Real service; the repo honors `deletedAt: IsNull()` like the database would. */
function setup(rows: any[]) {
  const repo = new FakeRepo(rows);
  const cache = { get: jest.fn().mockResolvedValue([]), set: jest.fn(), del: jest.fn() };
  const service = new MedicalCenterService(
    repo as any, {} as any, {} as any, {} as any, {} as any, cache as any, {} as any, {} as any,
  );
  return { service, repo };
}

describe('MedicalCenterService.removeDoctor on a deleted center (MJ-15)', () => {
  it('a soft-deleted center is 404, the same as assignDoctor', async () => {
    const { service } = setup([{ id: 'mc-del', deletedAt: new Date(), doctors: [{ id: 'doc-1' }] }]);
    await expect(service.removeDoctor('mc-del', 'doc-1')).rejects.toThrow(NotFoundException);
    await expect(service.assignDoctor('mc-del', 'doc-1')).rejects.toThrow(NotFoundException);
  });
});
