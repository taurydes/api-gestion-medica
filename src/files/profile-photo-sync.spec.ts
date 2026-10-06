import { ForbiddenException, UnsupportedMediaTypeException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sharp from 'sharp';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { CommonPersonImage } from 'src/common-person/entities/common-person-image.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { DoctorImage } from 'src/doctors/entities/doctor-image.entity';
import { authContextForUsers } from '../../test/auth-context-stub';
import { FilesService } from './files.service';
import { PhotoAccessService } from './photo-access.service';
import { ProfilePhotoSyncService } from './profile-photo-sync.service';

const USER_A = '11111111-1111-4111-8111-111111111111';
const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NURSE = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';

const USERS = {
  [USER_A]: { isAdmin: false, doctorId: DOC_A },
  [NURSE]: { isAdmin: false, doctorId: null },
  [ADMIN]: { isAdmin: true, doctorId: null },
};

/** Real FilesService over a temp uploads folder, real access rules, stubbed repositories. */
async function build(options: { patient?: boolean } = {}) {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-sync-spec-'));
  const config = { get: (key: string) => ({ UPLOADS_PATH: uploadsDir, URL_HOST: 'localhost', PORT: '8008' })[key] };
  const files = new FilesService({} as any, {} as any, {} as any, {} as any, {} as any, config as any);
  const authContext = authContextForUsers(USERS);
  const userLookup = { findOne: jest.fn(async ({ where }: any) => ({ id: where.id, commonPerson: { id: `cp-${where.id}` } })) };
  const photoAccess = new PhotoAccessService(userLookup as any, {} as any, authContext);

  const personRepo = { update: jest.fn() };
  const imageRepo = {
    update: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ id: 'img-1', ...x })),
  };
  const legacyRepo = { update: jest.fn() };
  const patientRepo = { count: jest.fn().mockResolvedValue(options.patient ? 1 : 0) };
  const repos = new Map<unknown, unknown>([
    [CommonPerson, personRepo], [DoctorImage, imageRepo], [CommonPersonImage, legacyRepo], [Patient, patientRepo],
  ]);
  const manager = { getRepository: (entity: unknown) => repos.get(entity) };
  const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };
  // The doctor's person is cp-<its user>; a user is found by id or by its person.
  const doctorRepo = {
    findOne: jest.fn(async ({ where }: any) => (where.id === DOC_A ? { id: DOC_A, commonPersonId: `cp-${USER_A}` } : null)),
  };
  const userRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      const id = where.id ?? String(where.commonPerson?.id ?? '').replace(/^cp-/, '');
      return id ? { id, commonPerson: { id: `cp-${id}` } } : null;
    }),
  };
  const cache = { del: jest.fn(), get: jest.fn(), set: jest.fn() };
  const service = new ProfilePhotoSyncService(
    files, photoAccess, authContext, userRepo as any, doctorRepo as any, dataSource as any, cache as any,
  );
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();
  const file = { originalname: 'foto.png', mimetype: 'image/png', size: png.length, buffer: png } as any;
  const stored = (...segments: string[]) => {
    const dir = path.join(uploadsDir, ...segments);
    return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  };
  return { service, file, stored, personRepo, imageRepo, legacyRepo, dataSource };
}

describe('Profile and doctor photo sync', () => {
  it('own user photo with alsoForDoctor → user file and a new active doctor image', async () => {
    const { service, file, stored, imageRepo } = await build();
    const out = await service.uploadUserPhoto(USER_A, file, undefined, true);
    expect(out.url).toMatch(new RegExp(`/files/profile-photos/${USER_A}/.+\\.webp$`));
    expect(out.doctorImageUrl).toBe('http://localhost:8008/files/doctor-images/img-1');
    expect(stored('users', USER_A, 'profile')).toHaveLength(1);
    expect(stored('doctors', DOC_A)).toHaveLength(1);
    expect(imageRepo.update).toHaveBeenCalledWith({ doctorId: DOC_A, isActive: true }, { isActive: false });
    expect(imageRepo.save).toHaveBeenCalledWith(expect.objectContaining({ doctorId: DOC_A, mimeType: 'image/webp' }));
  });

  it('without the flag only the user photo is stored', async () => {
    const { service, file, stored, dataSource } = await build();
    const out = await service.uploadUserPhoto(USER_A, file, undefined, false);
    expect(out).toEqual({ url: expect.any(String) });
    expect(stored('doctors', DOC_A)).toHaveLength(0);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('a user who is not a doctor gets doctorImageUrl null', async () => {
    const { service, file, dataSource } = await build();
    const out = await service.uploadUserPhoto(NURSE, file, undefined, true);
    expect(out.doctorImageUrl).toBeNull();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('a foreign owner → 403 before anything is written', async () => {
    const { service, file, stored, dataSource } = await build();
    await expect(service.uploadUserPhoto(NURSE, file, USER_A, true)).rejects.toThrow(ForbiddenException);
    expect(stored('users', USER_A, 'profile')).toHaveLength(0);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('a non-image declared as PNG → 415 (magic bytes)', async () => {
    const { service, stored } = await build();
    const fake = { originalname: 'x.png', mimetype: 'image/png', size: 4, buffer: Buffer.from('GIF8') } as any;
    await expect(service.uploadUserPhoto(USER_A, fake, undefined, true)).rejects.toThrow(UnsupportedMediaTypeException);
    expect(stored('users', USER_A, 'profile')).toHaveLength(0);
  });

  it('own doctor photo with alsoForUser → doctor image and the linked user photoUrl in one transaction', async () => {
    const { service, file, stored, personRepo, dataSource } = await build();
    const out = await service.uploadDoctorPhoto(USER_A, file, DOC_A, true);
    expect(out.userPhotoUrl).toMatch(new RegExp(`/files/profile-photos/${USER_A}/.+\\.webp$`));
    expect(personRepo.update).toHaveBeenCalledWith(`cp-${USER_A}`, { photoUrl: out.userPhotoUrl });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(stored('doctors', DOC_A)).toHaveLength(1);
    expect(stored('users', USER_A, 'profile')).toHaveLength(1);
  });

  it('doctor photo without the flag leaves the user photo alone', async () => {
    const { service, file, personRepo, stored } = await build();
    const out = await service.uploadDoctorPhoto(USER_A, file, DOC_A, false);
    expect(out).not.toHaveProperty('userPhotoUrl');
    expect(personRepo.update).not.toHaveBeenCalled();
    expect(stored('users', USER_A, 'profile')).toHaveLength(0);
  });

  it('another doctor photo → 403; an admin may set it and its user photo', async () => {
    const { service, file, personRepo } = await build();
    await expect(service.uploadDoctorPhoto(USER_A, file, DOC_B, true)).rejects.toThrow(ForbiddenException);
    expect(personRepo.update).not.toHaveBeenCalled();
    const out = await service.uploadDoctorPhoto(ADMIN, file, DOC_A, true);
    expect(out.userPhotoUrl).toContain(`/profile-photos/${USER_A}/`);
  });

  it('removing the user photo with alsoForDoctor clears both; without it only the user photo', async () => {
    const both = await build();
    await expect(both.service.removeUserPhoto(USER_A, true)).resolves.toEqual({ userPhotoRemoved: true, doctorPhotoRemoved: true });
    expect(both.personRepo.update).toHaveBeenCalledWith(`cp-${USER_A}`, { photoUrl: null });
    expect(both.imageRepo.update).toHaveBeenCalledWith({ doctorId: DOC_A, isActive: true }, { isActive: false });

    expect(both.legacyRepo.update).toHaveBeenCalledWith({ commonPersonId: `cp-${USER_A}`, isActive: true }, { isActive: false });

    const userOnly = await build();
    await expect(userOnly.service.removeUserPhoto(USER_A, false)).resolves.toEqual({ userPhotoRemoved: true, doctorPhotoRemoved: false });
    expect(userOnly.imageRepo.update).not.toHaveBeenCalled();
  });

  it('removing a doctor photo: own with alsoForUser clears both; another doctor → 403', async () => {
    const { service, personRepo, imageRepo } = await build();
    await expect(service.removeDoctorPhoto(USER_A, DOC_B, true)).rejects.toThrow(ForbiddenException);
    expect(imageRepo.update).not.toHaveBeenCalled();
    await expect(service.removeDoctorPhoto(USER_A, DOC_A, true)).resolves.toEqual({ userPhotoRemoved: true, doctorPhotoRemoved: true });
    expect(personRepo.update).toHaveBeenCalledWith(`cp-${USER_A}`, { photoUrl: null });
  });

  it('removing the user photo of a person who is also a patient keeps the patient photo rows', async () => {
    const { service, personRepo, legacyRepo } = await build({ patient: true });
    await service.removeUserPhoto(USER_A, false);
    expect(personRepo.update).toHaveBeenCalledWith(`cp-${USER_A}`, { photoUrl: null });
    expect(legacyRepo.update).not.toHaveBeenCalled();
  });
});
