import { BadRequestException, ConflictException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { SpecialtyService } from './specialty.service';

function setup(existing: { id: string; name: string; code: string } | null) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(existing),
    create: jest.fn((d) => d),
    save: jest.fn(async (d) => ({ id: 'new', ...d })),
  };
  const cache = { get: jest.fn().mockResolvedValue([]), set: jest.fn(), del: jest.fn() };
  return { service: new SpecialtyService(repo as any, cache as any), repo };
}

describe('SpecialtyService.create — case-insensitive name (M-19)', () => {
  it('looks the name up with LOWER() on both sides, as a bound parameter', async () => {
    const { service, repo } = setup(null);
    await service.create({ name: 'Mastología', code: 'MS' } as any);

    const nameFilter = repo.findOne.mock.calls[0][0].where.name as FindOperator<string>;
    expect(nameFilter.type).toBe('raw');
    expect(nameFilter.getSql?.('"specialty"."name"')).toBe('LOWER("specialty"."name") = LOWER(:name)');
    expect(nameFilter.objectLiteralParameters).toEqual({ name: 'Mastología' });
  });

  it('a race that reaches UQ_specialties_* (23505) answers 409', async () => {
    const { service, repo } = setup(null);
    repo.save.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));

    await expect(service.create({ name: 'Nueva', code: 'NV' } as any)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects "Mastología" when "mastología" exists and writes nothing', async () => {
    const { service, repo } = setup({ id: 's1', name: 'mastología', code: 'MT' });

    await expect(service.create({ name: 'Mastología', code: 'MS' } as any)).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
});
