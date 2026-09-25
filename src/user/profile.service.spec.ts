import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ProfileService } from './profile.service';

async function setup(options: { systemUser?: boolean; missing?: boolean } = {}) {
  const user = { id: 'u1', password: await bcrypt.hash('claveActual1', 4) };
  const found = options.missing ? null : user;
  const userRepo = {
    findOne: jest.fn().mockResolvedValue(options.systemUser ? null : found),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const secRepo = {
    findOne: jest.fn().mockResolvedValue(options.systemUser ? found : null),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const userService = { updateProfile: jest.fn().mockResolvedValue({ id: 'u1' }) };
  const service = new ProfileService(userRepo as any, secRepo as any, userService as any);
  return { service, userRepo, secRepo, userService };
}

describe('ProfileService.changePassword (M-31)', () => {
  it('contraseña actual incorrecta → 400 y el hash no cambia', async () => {
    const { service, userRepo } = await setup();
    await expect(
      service.changePassword('u1', { currentPassword: 'mala', newPassword: 'claveNueva1' }),
    ).rejects.toThrow(new BadRequestException('La contraseña actual es incorrecta'));
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('contraseña actual correcta → guarda un hash bcrypt de la nueva', async () => {
    const { service, userRepo } = await setup();
    await expect(
      service.changePassword('u1', { currentPassword: 'claveActual1', newPassword: 'claveNueva1' }),
    ).resolves.toEqual({ message: 'Contraseña actualizada correctamente' });

    const [id, changes] = userRepo.update.mock.calls[0];
    expect(id).toBe('u1');
    expect(await bcrypt.compare('claveNueva1', changes.password)).toBe(true);
  });

  it('la nueva igual a la actual → 400', async () => {
    const { service, userRepo } = await setup();
    await expect(
      service.changePassword('u1', { currentPassword: 'claveActual1', newPassword: 'claveActual1' }),
    ).rejects.toThrow(BadRequestException);
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('usuario de seguridad: actualiza seguridad.users', async () => {
    const { service, secRepo, userRepo } = await setup({ systemUser: true });
    await service.changePassword('u1', { currentPassword: 'claveActual1', newPassword: 'claveNueva1' });
    expect(secRepo.update).toHaveBeenCalled();
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('usuario inexistente o borrado → 404', async () => {
    const { service } = await setup({ missing: true });
    await expect(
      service.changePassword('u1', { currentPassword: 'x', newPassword: 'claveNueva1' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ProfileService.updateProfile (M-31)', () => {
  it('delega en UserService.updateProfile con el id del JWT', async () => {
    const { service, userService } = await setup();
    await service.updateProfile('u1', { email: 'yo@example.com' });
    expect(userService.updateProfile).toHaveBeenCalledWith('u1', { email: 'yo@example.com' });
  });
});
