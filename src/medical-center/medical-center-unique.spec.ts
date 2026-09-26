import { BadRequestException, ConflictException } from '@nestjs/common';
import { FakeRepo } from '../../test/in-memory-db';
import { MedicalCenterService } from './medical-center.service';

function setup(rows: any[]) {
  const repo = new FakeRepo(rows);
  const cache = { get: jest.fn().mockResolvedValue([]), del: jest.fn() };
  const service = new MedicalCenterService(
    repo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    cache as any,
    {} as any,
    {} as any,
  );
  return { service, repo };
}

describe('MedicalCenterService.create — names of deleted centers (M-21)', () => {
  it('a center can reuse the name of a deleted one', async () => {
    const { service, repo } = setup([{ id: 'c-old', name: 'Clínica Norte', deletedAt: new Date() }]);

    await service.create({ name: 'Clínica Norte' } as any);

    expect((await repo.find()).filter((c) => c.name === 'Clínica Norte')).toHaveLength(2);
  });

  it('an active center with the same name is still rejected', async () => {
    const { service } = setup([{ id: 'c1', name: 'Clínica Norte', deletedAt: null }]);

    await expect(service.create({ name: 'Clínica Norte' } as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('a race that reaches the unique index (23505) answers 409, not 400/500', async () => {
    const { service, repo } = setup([]);
    jest
      .spyOn(repo, 'save')
      .mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));

    await expect(service.create({ name: 'Clínica Sur' } as any)).rejects.toThrow(
      ConflictException,
    );
  });
});
