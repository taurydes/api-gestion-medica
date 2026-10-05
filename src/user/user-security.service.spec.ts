import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  USER_ROLE_CHANGE_PERMISSION,
  USER_STATUS_CHANGE_PERMISSION,
} from './user-admin-fields';
import { UserSecurityController } from './user-security.controller';
import { UserSecurityService } from './user-security.service';

const SUPERUSER_ROLE = '2812c7ac-4829-4880-a3b1-314cf88b4895';
const MEDICO_ROLE = '69cf7b3a-864c-44d7-8541-1ab57d34f49b';

function setup() {
  const stored = {
    id: 's1',
    name: 'operador',
    email: 'op@example.com',
    password: 'hash',
    roleId: MEDICO_ROLE,
    status: true,
  };
  const repo = {
    findOne: jest.fn().mockResolvedValue(stored),
    findOneBy: jest.fn().mockResolvedValue(stored),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    // Identity lookup: OR of { email } / { name } conditions over the stored row.
    find: jest.fn(async ({ where }: any) =>
      [stored].filter((u: any) => where.some((c: any) => Object.entries(c).every(([k, v]) => u[k] === v))),
    ),
    create: jest.fn((data: any) => data),
    save: jest.fn(async (data: any) => ({ id: 's2', ...data })),
  };
  const cache = {
    get: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    set: jest.fn(),
  };
  const redisSession = { deleteSession: jest.fn().mockResolvedValue(undefined) };
  const service = new UserSecurityService(
    repo as any,
    cache as any,
    redisSession as any,
  );
  return { service, repo, redisSession };
}

describe('UserSecurityService.update — misma regla que PATCH /users (C-01)', () => {
  it('sin role.actualizar no puede cambiar el rol: 403 y no escribe', async () => {
    const { service, repo } = setup();
    const call = service.update('s1', { roleId: SUPERUSER_ROLE } as UpdateUserDto, [
      'user-security.actualizar',
    ]);

    await expect(call).rejects.toThrow(ForbiddenException);
    await expect(call).rejects.toThrow('No tiene permiso para cambiar el rol del usuario.');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('sin user.eliminar no puede cambiar el estado: 403 y no revoca', async () => {
    const { service, repo, redisSession } = setup();
    await expect(
      service.update('s1', { status: false } as UpdateUserDto, ['user-security.actualizar']),
    ).rejects.toThrow(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
    expect(redisSession.deleteSession).not.toHaveBeenCalled();
  });

  it('con role.actualizar el rol sí cambia', async () => {
    const { service, repo } = setup();
    await service.update('s1', { roleId: SUPERUSER_ROLE } as UpdateUserDto, [
      USER_ROLE_CHANGE_PERMISSION,
    ]);
    expect(repo.update).toHaveBeenCalledWith('s1', { roleId: SUPERUSER_ROLE });
  });

  it('reenviar el mismo roleId y status no exige permiso de admin', async () => {
    const { service, repo } = setup();
    await service.update(
      's1',
      { roleId: MEDICO_ROLE, status: true, name: 'nuevo' } as UpdateUserDto,
      ['user-security.actualizar'],
    );
    expect(repo.update).toHaveBeenCalledWith('s1', { name: 'nuevo' });
  });

  it('desactivar revoca la sesión antes del UPDATE', async () => {
    const { service, repo, redisSession } = setup();
    await service.update('s1', { status: false } as UpdateUserDto, [
      USER_STATUS_CHANGE_PERMISSION,
    ]);
    expect(repo.update).toHaveBeenCalledWith('s1', { status: false });
    expect(redisSession.deleteSession.mock.invocationCallOrder[0]).toBeLessThan(
      repo.update.mock.invocationCallOrder[0],
    );
  });

  it('si Redis falla al desactivar responde 503 y no escribe', async () => {
    const { service, repo, redisSession } = setup();
    redisSession.deleteSession.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      service.update('s1', { status: false } as UpdateUserDto, [
        USER_STATUS_CHANGE_PERMISSION,
      ]),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('UserSecurityService.remove — revoca antes de borrar (C-02)', () => {
  it('revoca session:{id} antes del DELETE', async () => {
    const { service, repo, redisSession } = setup();
    await service.remove('s1');
    expect(redisSession.deleteSession).toHaveBeenCalledWith('s1');
    expect(redisSession.deleteSession.mock.invocationCallOrder[0]).toBeLessThan(
      repo.delete.mock.invocationCallOrder[0],
    );
  });

  it('si Redis falla responde 503 (no 404) y no borra', async () => {
    const { service, repo, redisSession } = setup();
    redisSession.deleteSession.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(service.remove('s1')).rejects.toThrow(ServiceUnavailableException);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});

describe('UserSecurityController.update — reenvía los permisos del actor (C-01)', () => {
  it('pasa req.userPermissions al servicio', async () => {
    const service = { update: jest.fn().mockResolvedValue({}) };
    const controller = new UserSecurityController(service as any);
    const dto = { roleId: SUPERUSER_ROLE } as UpdateUserDto;

    await controller.update('s1', dto, { userPermissions: ['user-security.actualizar'] });
    expect(service.update).toHaveBeenCalledWith('s1', dto, ['user-security.actualizar']);
  });
});

describe('UserSecurityService — usernames and emails are normalized', () => {
  it('creating "OPERADOR" when "operador" exists is a 409', async () => {
    const { service, repo } = setup();
    await expect(
      service.create({ name: ' OPERADOR ', email: 'nuevo@example.com', password: 'Clave12345', roleId: MEDICO_ROLE } as any),
    ).rejects.toThrow(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('a new security user is stored trimmed and lowercased', async () => {
    const { service, repo } = setup();
    await service.create({ name: ' Nuevo ', email: ' Nuevo@Example.COM', password: 'Clave12345', roleId: MEDICO_ROLE } as any);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'nuevo', email: 'nuevo@example.com' }));
  });
});
