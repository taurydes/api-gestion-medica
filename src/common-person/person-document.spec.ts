import { ConflictException, ValidationPipe } from '@nestjs/common';
import { UpdateCommonPersonDto } from './dto/update-common-person.dto';
import { QueryFailedError } from 'typeorm';
import { FakeRepo } from '../../test/in-memory-db';
import { CommonPersonService } from './common-person.service';
import { UserService } from 'src/user/user.service';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { PERSON_DOCUMENT_CONFLICT, uniqueViolationToConflict } from './person-document.util';

const people = () => [
  { id: 'cp-v', letter: 'V', documentNumber: '123', deletedAt: null },
  { id: 'cp-e', letter: 'E', documentNumber: '999', deletedAt: null },
];

function userServiceWith(personRepo: FakeRepo) {
  const saved: any[] = [];
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      create: (_entity: unknown, data: any) => ({ ...data }),
      save: jest.fn(async (entity: any) => {
        entity.id ??= `new-${saved.length}`;
        saved.push(entity);
        return entity;
      }),
    },
  };
  const usersRepo = {
    createQueryBuilder: () => {
      const qb: any = { where: () => qb, andWhere: () => qb, getOne: async () => null };
      return qb;
    },
  };
  const cache = { get: jest.fn().mockResolvedValue([]), del: jest.fn(), set: jest.fn() };
  const service = new UserService(
    usersRepo as any,
    personRepo as any,
    {} as any,
    {} as any,
    cache as any,
    { createQueryRunner: () => queryRunner } as any,
    {} as any,
    {} as any,
  );
  return { service, saved };
}

describe('Person document lookups and conflicts (M-18)', () => {
  it('POST /users with E-123 while V-123 exists creates a new E-123 person', async () => {
    const { service, saved } = userServiceWith(new FakeRepo(people()));
    const dto = {
      name: 'nuevo',
      email: 'nuevo@example.com',
      password: 'secreto1',
      roleId: 'r1',
      commonPerson: { letter: 'E', documentNumber: '123', firstName: 'Eva', lastName: 'Ruiz' },
    } as unknown as CreateUserDto;

    await service.create(dto);

    const person = saved.find((e) => e.documentNumber === '123');
    expect(person).toMatchObject({ letter: 'E', firstName: 'Eva' });
    expect(person.id).not.toBe('cp-v');
  });

  it('POST /users with a document already held by an active person → 409', async () => {
    const { service, saved } = userServiceWith(new FakeRepo(people()));
    const dto = {
      name: 'otro',
      email: 'otro@example.com',
      password: 'secreto1',
      commonPerson: { letter: 'V', documentNumber: '123', firstName: 'X', lastName: 'Y' },
    } as unknown as CreateUserDto;

    await expect(service.create(dto)).rejects.toThrow(ConflictException);
    expect(saved).toHaveLength(0);
  });

  it('updating a person to a document another active person holds → 409 and nothing written', async () => {
    const repo = new FakeRepo(people());
    const update = jest.spyOn(repo, 'update');
    const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };
    const service = new CommonPersonService(repo as any, cache as any);
    jest.spyOn(service, 'findOne').mockResolvedValue(people()[1] as any);

    await expect(
      service.update('cp-e', { letter: 'V', documentNumber: '123' } as any),
    ).rejects.toThrow(new ConflictException(PERSON_DOCUMENT_CONFLICT));
    expect(update).not.toHaveBeenCalled();
  });

  it('re-sending the unchanged document is not a conflict', async () => {
    const repo = new FakeRepo(people());
    const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };
    const service = new CommonPersonService(repo as any, cache as any);
    jest.spyOn(service, 'findOne').mockResolvedValue(people()[0] as any);

    await expect(
      service.update('cp-v', { letter: 'V', documentNumber: '123', firstName: 'Ana' } as any),
    ).resolves.toBeDefined();
  });

  it('PATCH with only phoneNumber writes only that column, never undefined names (H-03)', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const dto = await pipe.transform({ phoneNumber: '04141234567' }, { type: 'body', metatype: UpdateCommonPersonDto });
    const repo = new FakeRepo(people());
    const update = jest.spyOn(repo, 'update');
    const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };
    const service = new CommonPersonService(repo as any, cache as any);
    jest.spyOn(service, 'findOne').mockResolvedValue(people()[0] as any);

    await service.update('cp-v', dto);

    expect(Object.keys(update.mock.calls[0][1] as object)).toEqual(['phoneNumber']);
  });

  it('a 23505 from the database becomes a domain 409, not a 500', () => {
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'UQ_persona_comun_documento_activo',
    });
    const conflict = uniqueViolationToConflict(new QueryFailedError('INSERT …', [], driverError));

    expect(conflict).toBeInstanceOf(ConflictException);
    expect(conflict?.message).toBe(PERSON_DOCUMENT_CONFLICT);
    expect(uniqueViolationToConflict(new Error('other'))).toBeNull();
  });
});
