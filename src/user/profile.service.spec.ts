import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ProfileService } from './profile.service';
import { UserService } from './user.service';

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

describe('GET /auth/profile: perfil propio sin permiso de módulo (fase 2)', () => {
  const stored = {
    id: 'u1',
    name: 'marta',
    email: 'marta@example.com',
    password: 'hash',
    roleId: 'r1',
    role: { id: 'r1', name: 'enfermero', permissionMenus: [{ id: 'pm' }] },
    commonPerson: { id: 'cp1', firstName: 'Marta', lastName: 'Ruiz', phoneNumber: '04141234567' },
  };

  it('UserService.getOwnProfile devuelve persona, rol mínimo e imageUrl, nunca el hash', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(stored) };
    const images = { findOne: jest.fn().mockResolvedValue({ id: 'img1' }) };
    const files = { getCommonPersonImageUrl: jest.fn((id: string) => `/files/common-person-image/${id}`) };
    const userService = new UserService(
      repo as any, {} as any, images as any, files as any, {} as any, {} as any, {} as any,
      { find: jest.fn().mockResolvedValue([{ medicalCenter: { id: 'mc1', name: 'Centro 1', address: 'x' } }]) } as any,
    );

    const profile: any = await userService.getOwnProfile('u1');

    expect(profile).not.toHaveProperty('password');
    expect(profile.role).toEqual({ id: 'r1', name: 'enfermero' });
    expect(profile.commonPerson).toMatchObject({ firstName: 'Marta', phoneNumber: '04141234567' });
    expect(profile.imageUrl).toBe('/files/common-person-image/img1');
    expect(profile.medicalCenters).toEqual([{ id: 'mc1', name: 'Centro 1' }]);
    expect(repo.findOne.mock.calls[0][0].where.id).toBe('u1');
  });

  function buildUserService(found: any, image: any) {
    const images = { findOne: jest.fn().mockResolvedValue(image) };
    const files = { getCommonPersonImageUrl: jest.fn((id: string) => `/files/common-person-image/${id}`) };
    const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };
    const userService = new UserService(
      { findOne: jest.fn().mockResolvedValue(found) } as any, {} as any, images as any, files as any,
      cache as any, {} as any, {} as any, { find: jest.fn().mockResolvedValue([]) } as any,
    );
    return { userService, images };
  }

  it('imageUrl prefiere commonPerson.photoUrl (POST /files/profile-photo) sobre common_person_images', async () => {
    const photoUrl = 'http://localhost:8008/files/profile-photos/u1/a.webp';
    const { userService, images } = buildUserService(
      { ...stored, commonPerson: { ...stored.commonPerson, photoUrl } },
      { id: 'img1' },
    );

    const profile: any = await userService.getOwnProfile('u1');
    const detail: any = await userService.findOne('u1');

    expect(profile.imageUrl).toBe(photoUrl);
    expect(detail.imageUrl).toBe(photoUrl);
    expect(images.findOne).not.toHaveBeenCalled();
  });

  it('sin photoUrl cae a la última imagen activa; sin ninguna, null', async () => {
    const withImage = buildUserService({ ...stored, commonPerson: { ...stored.commonPerson, photoUrl: null } }, { id: 'img9' });
    const withoutImage = buildUserService({ ...stored, commonPerson: { ...stored.commonPerson, photoUrl: null } }, null);

    expect((await withImage.userService.getOwnProfile('u1') as any).imageUrl).toBe('/files/common-person-image/img9');
    expect((await withImage.userService.findOne('u1') as any).imageUrl).toBe('/files/common-person-image/img9');
    expect((await withoutImage.userService.getOwnProfile('u1') as any).imageUrl).toBeNull();
  });

  it('un usuario de seguridad sin persona recibe commonPerson null', async () => {
    const secRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 's1', name: 'admin', email: 'a@x.com', password: 'h', role: { id: 'r0', name: 'superusuario' } }),
    };
    const service = new ProfileService({} as any, secRepo as any, { getOwnProfile: jest.fn().mockResolvedValue(null) } as any);

    const profile: any = await service.getProfile('s1');

    expect(profile).toMatchObject({ id: 's1', commonPerson: null, imageUrl: null, role: { id: 'r0', name: 'superusuario' } });
    expect(profile).not.toHaveProperty('password');
  });

  it('usuario inexistente → 404', async () => {
    const service = new ProfileService(
      {} as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      { getOwnProfile: jest.fn().mockResolvedValue(null) } as any,
    );
    await expect(service.getProfile('nadie')).rejects.toThrow(NotFoundException);
  });
});
