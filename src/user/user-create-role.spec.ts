import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Role } from 'src/role/entities/role.entity';
import { User } from './entities/user.entity';
import { UserService } from './user.service';

const MEDICO_ROLE = '69cf7b3a-864c-44d7-8541-1ab57d34f49b';
const OTHER_ROLE = 'c6dcc63d-bc87-46db-b60b-5c1d3221b8f4';

function setup(roles: Array<Partial<Role>>) {
  const saved: any[] = [];
  const manager = {
    getRepository: (entity: unknown) => ({
      findOne: async ({ where }: any) =>
        entity === Role
          ? roles.find(
              (r) => r.name === where.name && r.isActive === where.isActive && r.deletedAt == null,
            ) ?? null
          : null,
      findBy: async () => [],
      findOneBy: async () => null,
    }),
    create: (_entity: unknown, data: any) => ({ ...data, __entity: _entity }),
    save: async (row: any) => {
      row.id ??= `id-${saved.length + 1}`;
      saved.push(row);
      return row;
    },
  };
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager,
  };
  const repo = {
    createQueryBuilder: () => {
      const qb: any = { where: () => qb, andWhere: () => qb, getOne: async () => null };
      return qb;
    },
  };
  const cache = { get: jest.fn().mockResolvedValue([]), del: jest.fn(), set: jest.fn() };
  const service = new UserService(
    repo as any,
    { findOne: async () => null } as any,
    {} as any,
    {} as any,
    cache as any,
    { createQueryRunner: () => queryRunner } as any,
    {} as any,
  );
  const savedUser = () => saved.find((row) => row.__entity === User);
  return { service, savedUser, queryRunner };
}

const base = {
  name: 'nuevo.medico',
  email: 'nuevo.medico@example.com',
  password: 'secreto1',
  commonPerson: { firstName: 'Nuevo', lastName: 'Médico' },
};

describe('UserService.create: rol por defecto del médico (M-33)', () => {
  it('con doctor y sin roleId asigna el rol medico resuelto por nombre', async () => {
    const { service, savedUser } = setup([{ id: MEDICO_ROLE, name: 'medico', isActive: true, deletedAt: null }]);

    await service.create({ ...base, doctor: { licenseNumber: 'LIC-1' } } as any);

    expect(savedUser().roleId).toBe(MEDICO_ROLE);
  });

  it('un roleId explícito tiene prioridad', async () => {
    const { service, savedUser } = setup([{ id: MEDICO_ROLE, name: 'medico', isActive: true, deletedAt: null }]);

    await service.create({ ...base, roleId: OTHER_ROLE, doctor: { licenseNumber: 'LIC-1' } } as any);

    expect(savedUser().roleId).toBe(OTHER_ROLE);
  });

  it('sin rol medico activo → 422 con mensaje claro y rollback', async () => {
    const { service, savedUser, queryRunner } = setup([
      { id: MEDICO_ROLE, name: 'medico', isActive: false, deletedAt: null },
    ]);

    await expect(service.create({ ...base, doctor: { licenseNumber: 'LIC-1' } } as any)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(savedUser()).toBeUndefined();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it('un usuario que no es médico sigue necesitando roleId (400)', async () => {
    const { service } = setup([{ id: MEDICO_ROLE, name: 'medico', isActive: true, deletedAt: null }]);

    await expect(service.create({ ...base } as any)).rejects.toThrow(BadRequestException);
  });
});
