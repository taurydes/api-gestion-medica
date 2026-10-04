import { ForbiddenException } from '@nestjs/common';
import { PhotoAccessService } from './photo-access.service';
import { FilesController } from './files.controller';
import { PERMISSIONS_KEY } from 'src/auth/decorators/permission.decorator';
import { authContextForUsers } from '../../test/auth-context-stub';

const USERS = {
  'user-a': { isAdmin: false, doctorId: 'doc-a' },
  'user-admin': { isAdmin: true, doctorId: null },
  'nurse-1': { isAdmin: false, doctorId: null, centerIds: ['mc-1'] },
};

/** Real service; `inScope` is what the patient-scope query answers for the patient person. */
function build(options: { inScope?: boolean } = {}) {
  const userRepo = {
    findOne: jest.fn(async ({ where }: any) => ({ id: where.id, commonPerson: { id: `cp-${where.id}` } })),
  };
  const patientRepo = {
    findOne: jest.fn(async ({ where }: any) => (where.commonPersonId === 'cp-patient' ? { id: 'pat-1' } : null)),
    query: jest.fn().mockResolvedValue(options.inScope ? [{ ok: 1 }] : []),
  };
  return new PhotoAccessService(userRepo as any, patientRepo as any, authContextForUsers(USERS));
}

describe('Photos check the owner of the record (MJ-43)', () => {
  it('own person photo → ok; another staff member → 403', async () => {
    await expect(build().assertCanSetPersonPhoto('nurse-1', 'cp-nurse-1')).resolves.toBeUndefined();
    await expect(build().assertCanSetPersonPhoto('nurse-1', 'cp-user-a')).rejects.toThrow(ForbiddenException);
  });

  it('a patient the actor may edit → ok; one outside their scope → 403', async () => {
    await expect(build({ inScope: true }).assertCanSetPersonPhoto('user-a', 'cp-patient')).resolves.toBeUndefined();
    await expect(build({ inScope: false }).assertCanSetPersonPhoto('user-a', 'cp-patient')).rejects.toThrow(ForbiddenException);
  });

  it('an admin sets any person photo', async () => {
    await expect(build().assertCanSetPersonPhoto('user-admin', 'cp-user-a')).resolves.toBeUndefined();
  });

  it('doctor photo: own → ok, another doctor → 403, admin → ok', async () => {
    await expect(build().assertCanSetDoctorPhoto('user-a', 'doc-a')).resolves.toBeUndefined();
    await expect(build().assertCanSetDoctorPhoto('user-a', 'doc-b')).rejects.toThrow(ForbiddenException);
    await expect(build().assertCanSetDoctorPhoto('user-admin', 'doc-b')).resolves.toBeUndefined();
  });
});

describe('Own profile photo with a session only (MJ-46)', () => {
  it('upload: no owner or own owner → ok; another owner → 403 unless admin', async () => {
    await expect(build().assertProfileOwner('nurse-1', undefined)).resolves.toBeUndefined();
    await expect(build().assertProfileOwner('nurse-1', 'nurse-1')).resolves.toBeUndefined();
    await expect(build().assertProfileOwner('nurse-1', 'user-a')).rejects.toThrow(ForbiddenException);
    await expect(build().assertProfileOwner('user-admin', 'user-a')).resolves.toBeUndefined();
  });

  it('serve: own photo with a session → ok; a foreign one only for an admin (never file.consultar alone)', async () => {
    await expect(build().assertCanReadProfile('nurse-1', 'nurse-1')).resolves.toBeUndefined();
    await expect(build().assertCanReadProfile('nurse-1', 'user-a')).rejects.toThrow(ForbiddenException);
    // user-a is a doctor with file.consultar in the real matrix: still 403 on a foreign profile photo.
    await expect(build().assertCanReadProfile('user-a', 'nurse-1')).rejects.toThrow(ForbiddenException);
    await expect(build().assertCanReadProfile('user-admin', 'nurse-1')).resolves.toBeUndefined();
  });

  it('the profile photo routes carry no module permission (session is enough)', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, FilesController.prototype.uploadProfilePhoto)).toBeUndefined();
    expect(Reflect.getMetadata(PERMISSIONS_KEY, FilesController.prototype.serveProfilePhoto)).toBeUndefined();
  });

  it('person photos accept patient.crear/actualizar (upload) and patient.consultar (read) besides file.*', () => {
    const perms = (name: keyof FilesController) => Reflect.getMetadata(PERMISSIONS_KEY, FilesController.prototype[name]);
    for (const upload of ['uploadCommonPersonPhoto', 'uploadCommonPersonImage'] as const) {
      expect(perms(upload)).toEqual(['file.crear', 'patient.crear', 'patient.actualizar']);
    }
    for (const read of ['serveCommonPersonPhoto', 'serveCommonPersonImage'] as const) {
      expect(perms(read)).toEqual(['file.consultar', 'patient.consultar']);
    }
  });

  it('the upload defaults the owner to the caller', async () => {
    const filesService = { uploadProfilePhoto: jest.fn().mockResolvedValue({ url: 'u' }) };
    const controller = new FilesController(filesService as any, {} as any, {} as any, build());
    await controller.uploadProfilePhoto({} as any, undefined as any, 'nurse-1');
    expect(filesService.uploadProfilePhoto).toHaveBeenCalledWith({}, 'nurse-1');
  });
});
