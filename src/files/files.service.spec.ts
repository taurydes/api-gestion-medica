import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FilesService } from './files.service';

const UUID = '3f2b8a54-8e1c-4b7a-9d2e-1c5f6a7b8c9d';

function setup() {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-spec-'));
  const config = {
    get: (key: string) =>
      ({ UPLOADS_PATH: uploadsDir, URL_HOST: 'localhost', PORT: '8008' })[key],
  };
  const appointmentFileRepo = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ id: 'file-1', ...x })),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const service = new FilesService(
    {} as any,
    appointmentFileRepo as any,
    {} as any,
    {} as any,
    {} as any,
    config as any,
  );
  const res = { setHeader: jest.fn() };
  return { service, uploadsDir, appointmentFileRepo, res };
}

const image = (originalname = 'foto.png') =>
  ({ originalname, mimetype: 'image/png', size: 10, buffer: Buffer.from('x') }) as any;

describe('FilesService — path traversal (M-08)', () => {
  it('uploadFile: name con directorios → 400 y no escribe fuera de uploads', async () => {
    const { service, uploadsDir } = setup();
    await expect(
      service.uploadFile({ name: '../../dist/x.js', content: 'eA==' }),
    ).rejects.toThrow(BadRequestException);
    expect(fs.existsSync(path.resolve(uploadsDir, '../../dist/x.js'))).toBe(false);
  });

  it('uploadFile: nombre válido se guarda dentro de uploads y no devuelve URL pública', async () => {
    const { service, uploadsDir } = setup();
    await expect(service.uploadFile({ name: 'doc.txt', content: 'eA==' })).resolves.toEqual({
      url: null,
      name: 'doc.txt',
    });
    expect(fs.existsSync(path.join(uploadsDir, 'doc.txt'))).toBe(true);
  });

  it.each(['../../.env', '..\\..\\.env', '..', 'a/b.webp'])(
    'serveProfilePhoto: filename %p → 400 sin leer disco',
    async (filename) => {
      const { service, res } = setup();
      await expect(service.serveProfilePhoto(UUID, filename, res)).rejects.toThrow(
        BadRequestException,
      );
      expect(res.setHeader).not.toHaveBeenCalled();
    },
  );

  it('serveProfilePhoto: ownerId que no es UUID → 400', async () => {
    const { service, res } = setup();
    await expect(service.serveProfilePhoto('../..', '.env', res)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('serveCommonPersonPhoto acepta la carpeta "general" pero no rutas', async () => {
    const { service, res } = setup();
    await expect(service.serveCommonPersonPhoto('general', 'no-existe.webp', res)).rejects.toThrow(
      'Foto de persona no encontrada en el servidor.',
    );
    await expect(service.serveCommonPersonPhoto('general', '../x', res)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('uploadAppointmentFile: medicalCenterId "../x" → 400 y no guarda registro', async () => {
    const { service, appointmentFileRepo } = setup();
    await expect(
      service.uploadAppointmentFile(image(), {
        appointmentId: UUID,
        patientId: UUID,
        medicalCenterId: '../x',
        uploadedBy: UUID,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(appointmentFileRepo.save).not.toHaveBeenCalled();
  });

  it('uploadAppointmentFile: con UUIDs válidos guarda dentro de uploads', async () => {
    const { service, uploadsDir } = setup();
    const saved = await service.uploadAppointmentFile(image('../../evil.png'), {
      appointmentId: UUID,
      patientId: UUID,
      medicalCenterId: UUID,
      uploadedBy: UUID,
    });
    const full = path.resolve(uploadsDir, saved.filePath);
    expect(full.startsWith(path.resolve(uploadsDir) + path.sep)).toBe(true);
    expect(fs.existsSync(full)).toBe(true);
  });

  it('serveAppointmentFile: un filePath de BD que sale de uploads → 400', async () => {
    const { service, appointmentFileRepo, res } = setup();
    appointmentFileRepo.findOne.mockResolvedValue({ filePath: '../../.env' });
    await expect(service.serveAppointmentFile('file-1', res)).rejects.toThrow(BadRequestException);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});

describe('FilesService — URLs protegidas en lugar de /uploads (M-06)', () => {
  it('getFilesByAppointment devuelve la URL del endpoint con guard', async () => {
    const { service, appointmentFileRepo } = setup();
    appointmentFileRepo.find.mockResolvedValue([{ id: 'f1', filePath: 'a/b/c.png' }]);
    const [file] = await service.getFilesByAppointment(UUID);
    expect(file.url).toBe('http://localhost:8008/files/appointment-files/f1');
  });
});
