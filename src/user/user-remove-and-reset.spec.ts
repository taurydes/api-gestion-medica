import { BadRequestException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { FakeRepo } from '../../test/in-memory-db';
import { CommonPerson } from '../common-person/entities/common-person.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { User } from './entities/user.entity';
import { USER_ROLE_CHANGE_PERMISSION, UserService } from './user.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateUserSecurityDto } from './dto/create-user-security.dto';
import { ProfileService } from './profile.service';

/** Real UserService; the query runner hands out FakeRepos over the given tables. */
function build(tables: { users: any[]; persons: any[]; patients?: any[]; doctors?: any[] }) {
  const repos = new Map<unknown, FakeRepo>([
    [User, new FakeRepo(tables.users)],
    [CommonPerson, new FakeRepo(tables.persons)],
    [Patient, new FakeRepo(tables.patients ?? [])],
    [Doctor, new FakeRepo(tables.doctors ?? [])],
  ]);
  // FakeRepo has no relations: expose the linked person the way findOne(..., relations) would.
  const users = repos.get(User)!;
  const plainFindOne = users.findOne.bind(users);
  users.findOne = async (opts: any) => {
    const row: any = await plainFindOne(opts);
    return row ? { ...row, commonPerson: tables.persons.find((p) => p.id === row.commonPersonId) } : null;
  };
  const queryRunner = {
    connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(), release: jest.fn(),
    manager: { getRepository: (entity: unknown) => repos.get(entity) },
  };
  const redisSession = { deleteSession: jest.fn().mockResolvedValue(undefined) };
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const service = new UserService(
    users as any, repos.get(CommonPerson) as any, {} as any, {} as any, cache as any,
    { createQueryRunner: () => queryRunner } as any, redisSession as any, {} as any,
  );
  return { service, redisSession };
}

const person = (id: string) => ({ id, deletedAt: null, isActive: true });
const user = (id: string, personId: string, extra: Record<string, any> = {}) => ({
  id, commonPersonId: personId, deletedAt: null, status: true, firstLogin: false, password: 'old', ...extra,
});

describe('DELETE /users/:id keeps a person that is still a patient or a doctor (MJ-03)', () => {
  it.each([
    ['a live patient', { patients: [{ id: 'p1', commonPersonId: 'cp1', deletedAt: null }] }],
    ['a live doctor', { doctors: [{ id: 'd1', commonPersonId: 'cp1', deletedAt: null }] }],
  ])('person linked to %s → user deleted, person intact', async (_label, links) => {
    const persons = [person('cp1')];
    const users = [user('u1', 'cp1')];
    const { service } = build({ users, persons, ...links });

    await service.remove('u1');

    expect(users[0].deletedAt).toBeInstanceOf(Date);
    expect(persons[0]).toMatchObject({ deletedAt: null, isActive: true });
  });

  it('person only used by the account (or by deleted records) → deleted with it', async () => {
    const persons: any[] = [person('cp1')];
    const { service } = build({
      users: [user('u1', 'cp1')], persons,
      patients: [{ id: 'p-old', commonPersonId: 'cp1', deletedAt: new Date('2026-01-01') }],
    });

    await service.remove('u1');

    expect(persons[0].deletedAt).toBeInstanceOf(Date);
    expect(persons[0].isActive).toBe(false);
  });
});

describe('PATCH /users/:id/reset-password (MJ-05)', () => {
  const ADMIN = [USER_ROLE_CHANGE_PERMISSION];

  it('admin: stores the new hash, forces the change on next login and revokes the session', async () => {
    const users = [user('u1', 'cp1', { firstLogin: false })];
    const { service, redisSession } = build({ users, persons: [person('cp1')] });

    await service.resetPassword('u1', 'Temporal2026', 'admin-1', ADMIN);

    expect(await bcrypt.compare('Temporal2026', users[0].password)).toBe(true);
    expect(users[0].firstLogin).toBe(true);
    expect(redisSession.deleteSession).toHaveBeenCalledWith('u1');
  });

  it('without the admin permission → 403 and nothing changes', async () => {
    const users = [user('u1', 'cp1')];
    const { service } = build({ users, persons: [] });
    await expect(service.resetPassword('u1', 'Temporal2026', 'doc-user', ['user.actualizar'])).rejects.toThrow(
      ForbiddenException,
    );
    expect(users[0].password).toBe('old');
  });

  it('own account → 400 pointing to change-password; unknown or deleted user → 404', async () => {
    const { service } = build({
      users: [user('u1', 'cp1'), user('u2', 'cp2', { deletedAt: new Date() })],
      persons: [],
    });
    await expect(service.resetPassword('u1', 'Temporal2026', 'u1', ADMIN)).rejects.toThrow(BadRequestException);
    await expect(service.resetPassword('u2', 'Temporal2026', 'admin-1', ADMIN)).rejects.toThrow(NotFoundException);
  });

  it('changing the password afterwards clears the forced change', async () => {
    const users = [user('u1', 'cp1', { firstLogin: true, password: await bcrypt.hash('Temporal2026', 4) })];
    const profile = new ProfileService(new FakeRepo(users) as any, new FakeRepo([]) as any, {} as any);

    await profile.changePassword('u1', { currentPassword: 'Temporal2026', newPassword: 'MiClaveNueva1' });

    expect(users[0].firstLogin).toBe(false);
  });
});

describe('One policy for every new password: 8 characters (MJ-11, MJ-46)', () => {
  const pipe = new ValidationPipe({ whitelist: true });
  const errors = (metatype: any, body: object): Promise<string[]> =>
    pipe.transform(body, { type: 'body', metatype }).then(
      () => [],
      (e) => e.getResponse().message as string[],
    );

  it.each([
    ['reset', ResetPasswordDto, { newPassword: 'Corta12' }],
    ['change', ChangePasswordDto, { currentPassword: 'x', newPassword: 'Corta12' }],
    ['create user', CreateUserDto, { password: 'Corta12' }],
    ['create system user', CreateUserSecurityDto, { password: 'Corta12' }],
  ])('%s rejects 7 characters', async (_label, dto, body) => {
    expect((await errors(dto, body)).join(' ')).toMatch(/al menos 8 caracteres/);
  });

  it('8 characters pass the reset DTO', async () => {
    expect(await errors(ResetPasswordDto, { newPassword: 'Ocho1234' })).toEqual([]);
  });
});
