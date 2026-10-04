import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { User } from 'src/user/entities/user.entity';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import { Role } from './entities/role.entity';
import { RoleService } from './role.service';

function build(users: Record<string, any>[] = [], systemUsers: Record<string, any>[] = []) {
  const db = new InMemoryDb()
    .table(Role, [
      { id: 'r-qa', name: 'recepcion', isActive: true, deletedAt: null },
      { id: 'r-med', name: 'medico', isActive: true, deletedAt: null },
      { id: 'r-old', name: 'antiguo', isActive: false, deletedAt: new Date('2026-01-01') },
    ])
    .table(User, users)
    .table(UserSecurity, systemUsers);
  const roles = Object.assign(db.repo(Role), { manager: db.dataSource.manager });
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  return { service: new RoleService(roles, cache as any), db };
}

const role = (db: InMemoryDb, id: string) => db.rows(Role).find((r) => r.id === id)!;

describe('DELETE /roles/:id is a soft delete (MJ-07)', () => {
  it('a role without users keeps its row, marked deleted and inactive', async () => {
    const { service, db } = build([{ id: 'u1', roleId: 'r-qa', deletedAt: new Date('2026-02-01') }]);

    await service.remove('r-qa');

    expect(db.rows(Role)).toHaveLength(3);
    expect(role(db, 'r-qa')).toMatchObject({ isActive: false });
    expect(role(db, 'r-qa').deletedAt).toBeInstanceOf(Date);
  });

  it.each([
    ['a staff user', [{ id: 'u1', roleId: 'r-qa', deletedAt: null }], []],
    ['a system user', [], [{ id: 's1', roleId: 'r-qa', deletedAt: null }]],
  ])('a role still assigned to %s → 409 and nothing changes', async (_label, users, systemUsers) => {
    const { service, db } = build(users, systemUsers);

    await expect(service.remove('r-qa')).rejects.toThrow(ConflictException);
    expect(role(db, 'r-qa')).toMatchObject({ isActive: true, deletedAt: null });
  });

  it('a system role (medico) → 400', async () => {
    const { service, db } = build();
    await expect(service.remove('r-med')).rejects.toThrow(BadRequestException);
    expect(role(db, 'r-med').deletedAt).toBeNull();
  });

  it('a deleted role is gone for reads and writes → 404', async () => {
    const { service } = build();
    await expect(service.findOne('r-old')).rejects.toThrow(NotFoundException);
    await expect(service.remove('r-old')).rejects.toThrow(NotFoundException);
    await expect(service.update('r-old', { isActive: true })).rejects.toThrow(NotFoundException);
  });
});
