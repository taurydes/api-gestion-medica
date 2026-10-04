import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FakeRepo } from '../../test/in-memory-db';
import { authContextForUsers } from '../../test/auth-context-stub';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { AppointmentFileAccessService } from './appointment-file-access.service';

const APT_B = '0b0b0b0b-0000-4000-8000-00000000000b';
const APT_NO_CENTER = '0c0c0c0c-0000-4000-8000-00000000000c';
const CENTER = 'ce0ce0ce-0000-4000-8000-0000000000ce';
const PATIENT = 'aaaa1111-0000-4000-8000-000000000001';
const FOREIGN_PATIENT = 'aaaa2222-0000-4000-8000-000000000002';
const HISTORY = 'abc00000-0000-4000-8000-000000000001';
// The uploader id is a folder segment, so these users need UUIDs.
const USER_A = 'a0000000-0000-4000-8000-00000000000a';
const USER_B = 'b0000000-0000-4000-8000-00000000000b';
const ADMIN = 'ad000000-0000-4000-8000-0000000000ad';
const USERS = {
  [USER_A]: { isAdmin: false, doctorId: 'doc-a' },
  [USER_B]: { isAdmin: false, doctorId: 'doc-b' },
  [ADMIN]: { isAdmin: true, doctorId: null },
};
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('imagen')]);

function setup() {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-scope-'));
  const config = { get: (key: string) => ({ UPLOADS_PATH: uploadsDir })[key] };
  const files: any[] = [];
  const fileRepo = new FakeRepo(files);
  const filesService = new FilesService({} as any, fileRepo as any, {} as any, {} as any, {} as any, config as any);
  const target = new AppointmentFileAccessService(
    new FakeRepo([
      { id: APT_B, doctorId: 'doc-b', patientId: PATIENT, medicalCenterId: CENTER, deletedAt: null },
      { id: APT_NO_CENTER, doctorId: 'doc-b', patientId: PATIENT, medicalCenterId: null, deletedAt: null },
    ]) as any,
    new FakeRepo([{ id: HISTORY, medicalAppointmentId: APT_B, deletedAt: null }]) as any,
    authContextForUsers(USERS),
    fileRepo as any,
  );
  const controller = new FilesController(filesService, {} as any, target);

  // A multer temp file, like the disk storage leaves it before the handler runs.
  const tempFile = () => {
    const tmp = path.join(uploadsDir, `.tmp-${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(tmp, PNG);
    return { originalname: 'mamo.png', mimetype: 'image/png', size: PNG.length, path: tmp } as any;
  };
  const upload = (file: any, userId: string, body: { appointmentId?: string; patientId?: string; medicalCenterId?: string; medicalHistoryId?: string } = {}) =>
    controller.uploadAppointmentFile(
      file,
      body.appointmentId ?? APT_B,
      body.medicalHistoryId as any,
      body.patientId as any,
      body.medicalCenterId as any,
      'mammography',
      undefined as any,
      userId,
    );
  return { upload, tempFile, files, controller, uploadsDir };
}

describe('POST /files/appointment-upload — patient from the appointment (MJ-32)', () => {
  it('doctor A uploading to doctor B appointment → 403, temp file removed, nothing saved', async () => {
    const { upload, tempFile, files } = setup();
    const file = tempFile();

    await expect(upload(file, USER_A, { patientId: PATIENT })).rejects.toThrow(ForbiddenException);

    expect(fs.existsSync(file.path)).toBe(false);
    expect(files).toHaveLength(0);
  });

  it('a patientId other than the appointment patient → 400, nothing saved', async () => {
    const { upload, tempFile, files } = setup();
    const file = tempFile();

    await expect(upload(file, USER_B, { patientId: FOREIGN_PATIENT })).rejects.toThrow(
      'patientId no corresponde al paciente de la cita.',
    );
    expect(fs.existsSync(file.path)).toBe(false);
    expect(files).toHaveLength(0);
  });

  it('a medicalCenterId or medicalHistoryId of something else → 400', async () => {
    const { upload, tempFile } = setup();
    await expect(upload(tempFile(), USER_B, { medicalCenterId: FOREIGN_PATIENT })).rejects.toThrow(BadRequestException);
    await expect(upload(tempFile(), USER_B, { medicalHistoryId: FOREIGN_PATIENT })).rejects.toThrow(BadRequestException);
  });

  it('doctor B uploads to their own appointment: patient and history come from the appointment', async () => {
    const { upload, tempFile, files } = setup();

    await upload(tempFile(), USER_B);

    expect(files[0]).toMatchObject({ appointmentId: APT_B, patientId: PATIENT, medicalHistoryId: HISTORY });
    expect(files[0].filePath).toContain(`${USER_B}/${CENTER}/${APT_B}/`);
  });

  it('the UI repeating the appointment values is accepted', async () => {
    const { upload, tempFile, files } = setup();
    await upload(tempFile(), USER_B, { patientId: PATIENT, medicalCenterId: CENTER, medicalHistoryId: HISTORY });
    expect(files).toHaveLength(1);
  });

  it('admin uploads to any appointment; one without center goes to the general folder', async () => {
    const { upload, tempFile, files } = setup();

    await upload(tempFile(), ADMIN, { appointmentId: APT_NO_CENTER, medicalCenterId: '' });

    expect(files[0]).toMatchObject({ appointmentId: APT_NO_CENTER, patientId: PATIENT, medicalHistoryId: null });
    expect(files[0].filePath).toContain(`${ADMIN}/general/${APT_NO_CENTER}/`);
  });
});

describe('GET /files/appointment-files — listing and download scoped (MJ-32)', () => {
  async function withFile() {
    const ctx = setup();
    await ctx.upload(ctx.tempFile(), USER_B);
    return { ...ctx, fileId: ctx.files[0].id };
  }
  const download = async (ctx: any, fileId: string, userId: string) => {
    const out = path.join(ctx.uploadsDir, `out-${Math.random().toString(36).slice(2)}`);
    const res: any = fs.createWriteStream(out);
    res.setHeader = jest.fn();
    await ctx.controller.serveAppointmentFile(fileId, res, userId);
    await new Promise((r) => res.on('close', r));
    return fs.readFileSync(out);
  };

  it('doctor A listing or downloading doctor B appointment files → 403', async () => {
    const ctx = await withFile();
    await expect(ctx.controller.getFilesByAppointment(APT_B, USER_A)).rejects.toThrow(ForbiddenException);
    await expect(ctx.controller.serveAppointmentFile(ctx.fileId, { setHeader: jest.fn() }, USER_A)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('doctor B lists and downloads their own appointment files', async () => {
    const ctx = await withFile();
    await expect(ctx.controller.getFilesByAppointment(APT_B, USER_B)).resolves.toHaveLength(1);
    expect(await download(ctx, ctx.fileId, USER_B)).toEqual(PNG);
  });

  it('admin lists and downloads any appointment files', async () => {
    const ctx = await withFile();
    await expect(ctx.controller.getFilesByAppointment(APT_B, ADMIN)).resolves.toHaveLength(1);
    expect(await download(ctx, ctx.fileId, ADMIN)).toEqual(PNG);
  });
});
