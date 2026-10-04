import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FilesService } from './files.service';
import { UserService } from 'src/user/user.service';

const ADMIN = '0d47fb45-9753-44b7-b1a6-06a73f803d27';
const NEW_USER = '5b0f6a55-4a0e-4c1a-9f5e-0000000000bb';

function filesService() {
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-move-'));
  const config = { get: (k: string) => ({ UPLOADS_PATH: uploads, URL_HOST: 'localhost', PORT: '8008' })[k] };
  const service = new FilesService({} as any, {} as any, {} as any, {} as any, {} as any, config as any);
  const put = (owner: string, file: string) => {
    const dir = path.join(uploads, 'users', owner, 'profile');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), 'img');
  };
  const exists = (owner: string, file: string) => fs.existsSync(path.join(uploads, 'users', owner, 'profile', file));
  return { service, put, exists };
}

describe('A photo uploaded while creating a user ends in the new user\'s folder', () => {
  it('moves the creator\'s upload to the new owner and returns the new URL', () => {
    const { service, put, exists } = filesService();
    put(ADMIN, 'a.webp');

    const url = service.relocateProfilePhoto(`http://localhost:8008/files/profile-photos/${ADMIN}/a.webp`, ADMIN, NEW_USER);

    expect(url).toBe(`http://localhost:8008/files/profile-photos/${NEW_USER}/a.webp`);
    expect(exists(NEW_USER, 'a.webp')).toBe(true);
    expect(exists(ADMIN, 'a.webp')).toBe(false);
  });

  it.each([
    ['another owner\'s photo', (s: FilesService) => s.relocateProfilePhoto(`http://h/files/profile-photos/${NEW_USER}/a.webp`, ADMIN, NEW_USER)],
    ['a non profile URL', (s: FilesService) => s.relocateProfilePhoto('http://h/files/common-person-images/x', ADMIN, NEW_USER)],
    ['no URL', (s: FilesService) => s.relocateProfilePhoto(null, ADMIN, NEW_USER)],
    ['a missing file', (s: FilesService) => s.relocateProfilePhoto(`http://h/files/profile-photos/${ADMIN}/gone.webp`, ADMIN, NEW_USER)],
  ])('%s → left alone (null)', (_label, run) => {
    expect(run(filesService().service)).toBeNull();
  });

  it('UserService.create stores the moved URL on the new person', async () => {
    const photoUrl = `http://localhost:8008/files/profile-photos/${ADMIN}/a.webp`;
    const moved = `http://localhost:8008/files/profile-photos/${NEW_USER}/a.webp`;
    const saved: any[] = [];
    const manager = {
      getRepository: () => ({ findOne: async () => ({ id: 'role-1', name: 'enfermero', isActive: true }), findBy: async () => [] }),
      create: (_e: unknown, data: any) => ({ ...data }),
      save: async (row: any) => {
        row.id ??= row.commonPerson ? NEW_USER : `cp-${saved.length + 1}`;
        saved.push(row);
        return row;
      },
    };
    const queryRunner = {
      connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(), rollbackTransaction: jest.fn(),
      release: jest.fn(), manager,
    };
    const qb: any = { where: () => qb, andWhere: () => qb, getOne: async () => null };
    const files = { relocateProfilePhoto: jest.fn().mockReturnValue(moved) };
    const personRepo = { findOne: async () => null, update: jest.fn() };
    const service = new UserService(
      { createQueryBuilder: () => qb } as any, personRepo as any, {} as any, files as any,
      { get: jest.fn().mockResolvedValue([]), del: jest.fn(), set: jest.fn() } as any,
      { createQueryRunner: () => queryRunner } as any, {} as any, {} as any,
    );

    const out: any = await service.create(
      { name: 'qa', email: 'qa@example.com', password: 'Temporal2026', roleId: 'role-1', commonPerson: { firstName: 'Q', lastName: 'A', photoUrl } } as any,
      [], ADMIN,
    );

    expect(files.relocateProfilePhoto).toHaveBeenCalledWith(photoUrl, ADMIN, NEW_USER);
    expect(personRepo.update).toHaveBeenCalledWith(expect.any(String), { photoUrl: moved });
    expect(out.commonPerson.photoUrl).toBe(moved);
  });
});
