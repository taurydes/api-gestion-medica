import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user.dto';
import { CommonPerson } from '../common-person/entities/common-person.entity';
import {
  USER_ROLE_CHANGE_PERMISSION,
  USER_STATUS_CHANGE_PERMISSION,
  UserService,
} from './user.service';

const SUPERUSER_ROLE = '2812c7ac-4829-4880-a3b1-314cf88b4895';
const MEDICO_ROLE = '69cf7b3a-864c-44d7-8541-1ab57d34f49b';

function setup() {
  const stored = {
    id: 'u1',
    name: 'marta',
    email: 'marta@example.com',
    password: 'hash-original',
    roleId: MEDICO_ROLE,
    status: true,
    commonPerson: { id: 'cp1' },
  };
  const repo = {
    findOne: jest.fn().mockResolvedValue(stored),
    findOneBy: jest.fn().mockResolvedValue(stored),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const commonPersonRepo = { update: jest.fn().mockResolvedValue(undefined) };
  const cache = {
    get: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(undefined),
    set: jest.fn(),
  };
  const redisSession = { deleteSession: jest.fn().mockResolvedValue(undefined) };
  const queryRunnerRepo = {
    findOne: jest.fn().mockResolvedValue(stored),
    update: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => ({
      update: () => ({ set: () => ({ where: () => ({ execute: jest.fn() }) }) }),
    })),
  };
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { getRepository: () => queryRunnerRepo },
  };
  // transaction(): writes count as committed only if the callback resolves.
  const committed: string[] = [];
  const dataSource = {
    createQueryRunner: () => queryRunner,
    transaction: async (work: (manager: any) => Promise<unknown>) => {
      const pending: string[] = [];
      const manager = {
        getRepository: (entity: unknown) => ({
          update: async (...args: unknown[]) => {
            const target = entity === CommonPerson ? commonPersonRepo : repo;
            await (target.update as any)(...args);
            pending.push(entity === CommonPerson ? 'persona_comun' : 'users');
          },
        }),
      };
      const result = await work(manager);
      committed.push(...pending);
      return result;
    },
  };

  const service = new UserService(
    repo as any,
    commonPersonRepo as any,
    {} as any,
    {} as any,
    cache as any,
    dataSource as any,
    redisSession as any,
  );
  return { service, repo, commonPersonRepo, redisSession, queryRunner, queryRunnerRepo, committed };
}

describe('UserService.update — escalada por PATCH /users/:id (M-04)', () => {
  it('médico con user.actualizar no puede cambiar el rol: 403 y no escribe', async () => {
    const { service, repo } = setup();
    const dto = { roleId: SUPERUSER_ROLE } as UpdateUserDto;

    await expect(service.update('u1', dto, ['user.actualizar'])).rejects.toThrow(
      ForbiddenException,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('con role.actualizar el rol sí cambia', async () => {
    const { service, repo } = setup();
    await service.update('u1', { roleId: SUPERUSER_ROLE } as UpdateUserDto, [
      USER_ROLE_CHANGE_PERMISSION,
    ]);
    expect(repo.update).toHaveBeenCalledWith('u1', { roleId: SUPERUSER_ROLE });
  });

  it('reenviar el mismo roleId y status (formulario de edición) no exige permiso de admin', async () => {
    const { service, repo } = setup();
    await service.update(
      'u1',
      { roleId: MEDICO_ROLE, status: true, email: 'nuevo@example.com' } as UpdateUserDto,
      ['user.actualizar'],
    );
    expect(repo.update).toHaveBeenCalledWith('u1', { email: 'nuevo@example.com' });
  });

  it('desactivar exige user.eliminar y borra la sesión en Redis', async () => {
    const { service, repo, redisSession } = setup();
    await expect(
      service.update('u1', { status: false } as UpdateUserDto, ['user.actualizar']),
    ).rejects.toThrow(ForbiddenException);
    expect(redisSession.deleteSession).not.toHaveBeenCalled();

    await service.update('u1', { status: false } as UpdateUserDto, [
      USER_STATUS_CHANGE_PERMISSION,
    ]);
    expect(repo.update).toHaveBeenCalledWith('u1', { status: false });
    expect(redisSession.deleteSession).toHaveBeenCalledWith('u1');
  });

  it('una contraseña que llegue al servicio nunca se escribe', async () => {
    const { service, repo } = setup();
    await service.update(
      'u1',
      { password: 'x', email: 'e@example.com' } as unknown as UpdateUserDto,
      [USER_ROLE_CHANGE_PERMISSION, USER_STATUS_CHANGE_PERMISSION],
    );
    const written = repo.update.mock.calls[0][1];
    expect(written).not.toHaveProperty('password');
  });

  it('el ValidationPipe real rechaza password en UpdateUserDto con 400', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    await expect(
      pipe.transform({ password: 'nuevaClave1' }, { type: 'body', metatype: UpdateUserDto }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      pipe.transform({ roleId: SUPERUSER_ROLE }, { type: 'body', metatype: UpdateUserDto }),
    ).resolves.toMatchObject({ roleId: SUPERUSER_ROLE });
  });
});

describe('UserService.updateProfile — perfil propio (M-31)', () => {
  it('ignora roleId y status aunque vengan en el objeto', async () => {
    const { service, repo, commonPersonRepo } = setup();
    await service.updateProfile('u1', {
      email: 'yo@example.com',
      commonPerson: { firstName: 'Marta' },
      roleId: SUPERUSER_ROLE,
      status: false,
    } as any);

    expect(repo.update).toHaveBeenCalledWith('u1', { email: 'yo@example.com' });
    expect(commonPersonRepo.update).toHaveBeenCalledWith('cp1', { firstName: 'Marta' });
  });
});

describe('UserService.update — desactivar revoca antes de escribir (R4-003)', () => {
  it('revoca session:{id} antes del UPDATE', async () => {
    const { service, repo, redisSession } = setup();
    await service.update('u1', { status: false } as UpdateUserDto, [
      USER_STATUS_CHANGE_PERMISSION,
    ]);
    expect(redisSession.deleteSession.mock.invocationCallOrder[0]).toBeLessThan(
      repo.update.mock.invocationCallOrder[0],
    );
  });

  it('si Redis falla responde 503 y no escribe nada', async () => {
    const { service, repo, redisSession } = setup();
    redisSession.deleteSession.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      service.update('u1', { status: false } as UpdateUserDto, [
        USER_STATUS_CHANGE_PERMISSION,
      ]),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('UserService.remove — revoca la sesión (M-05, C-03)', () => {
  it('revoca session:{id} dentro de la transacción, antes del commit', async () => {
    const { service, redisSession, queryRunner } = setup();
    await service.remove('u1');
    expect(redisSession.deleteSession).toHaveBeenCalledWith('u1');
    expect(redisSession.deleteSession.mock.invocationCallOrder[0]).toBeLessThan(
      queryRunner.commitTransaction.mock.invocationCallOrder[0],
    );
  });

  it('si Redis falla hace rollback y responde 503, nunca 404 ni 500', async () => {
    const { service, redisSession, queryRunner } = setup();
    redisSession.deleteSession.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(service.remove('u1')).rejects.toThrow(ServiceUnavailableException);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });
});

describe('UserService.update — users and persona_comun in one transaction', () => {
  it('if the persona_comun update fails, the users change is not committed either', async () => {
    const { service, commonPersonRepo, committed } = setup();
    commonPersonRepo.update.mockRejectedValue(new Error('db down'));

    await expect(
      service.update(
        'u1',
        { email: 'nuevo@example.com', commonPerson: { firstName: 'Marta' } } as UpdateUserDto,
        [],
      ),
    ).rejects.toThrow(new InternalServerErrorException('Error al actualizar el usuario.'));
    expect(committed).toEqual([]);
  });

  it('both writes commit together when they succeed', async () => {
    const { service, committed } = setup();
    await service.update(
      'u1',
      { email: 'nuevo@example.com', commonPerson: { firstName: 'Marta' } } as UpdateUserDto,
      [],
    );
    expect(committed).toEqual(['users', 'persona_comun']);
  });
});
