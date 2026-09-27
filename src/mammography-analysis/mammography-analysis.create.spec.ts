import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  ValidationPipe,
} from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { MammographyAnalysisService } from './mammography-analysis.service';
import { CreateMammographyAnalysisDto } from './dto/create-mammography-analysis.dto';

const FILE_ID = '11111111-1111-4111-8111-111111111111';
const APPT_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_ID = '33333333-3333-4333-8333-333333333333';

const detectorResult = {
  prediction: 'MALIGNANT',
  probability: 96.1880549788475,
  label: 'Neoplasia Maligna (BI-RADS 4/5)',
  status: 'danger',
  rawScore: 0.0381,
  malignancyProbability: 96.1880549788475,
  threshold: 0.15,
  modelVersion: 'v1',
  raw: { prediction: 'MALIGNO' },
};

function setup(opts: { scopedDoctorId?: string | null; appointmentDoctorId?: string; fileBytes?: Buffer } = {}) {
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'mammo-'));
  const relative = 'u/c/a/img.jpg';
  fs.mkdirSync(path.join(uploads, 'u/c/a'), { recursive: true });
  fs.writeFileSync(path.join(uploads, relative), opts.fileBytes ?? Buffer.from([0xff, 0xd8, 0xff, 1, 2]));

  const apptFile = {
    id: FILE_ID,
    appointmentId: APPT_ID,
    patientId: PATIENT_ID,
    filePath: relative,
    mimeType: 'image/jpeg',
    originalName: 'mamo.jpg',
  };
  const analysisRepo = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ ...x, id: 'new-id', createdAt: new Date() })),
  };
  const appointmentFileRepo = { findOne: jest.fn().mockResolvedValue(apptFile) };
  const appointmentRepo = {
    findOne: jest.fn().mockResolvedValue({ id: APPT_ID, doctorId: opts.appointmentDoctorId ?? 'doc-A' }),
  };
  const userRepo = { exists: jest.fn().mockResolvedValue(true) };
  const config = { get: (k: string) => (k === 'UPLOADS_PATH' ? uploads : undefined) };
  const authContext = { getScopedDoctorId: jest.fn().mockResolvedValue(opts.scopedDoctorId ?? null) };
  const detector = { predict: jest.fn().mockResolvedValue(detectorResult) };
  const dicom = { renderFrameJpeg: jest.fn().mockResolvedValue(Buffer.from('jpeg-from-dicom')) };

  const service = new MammographyAnalysisService(
    analysisRepo as any,
    appointmentFileRepo as any,
    appointmentRepo as any,
    userRepo as any,
    config as any,
    authContext as any,
    detector as any,
    dicom as any,
  );
  return { service, analysisRepo, appointmentFileRepo, detector, dicom, uploads };
}

describe('MammographyAnalysisService.create — predicción en el servidor (M-39)', () => {
  it('envía la imagen guardada al detector y persiste SU respuesta', async () => {
    const { service, detector, analysisRepo } = setup();
    const out = await service.create({ appointmentFileId: FILE_ID, notes: 'control' }, { id: 'user-A' });

    expect(detector.predict).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: Buffer.from([0xff, 0xd8, 0xff, 1, 2]),
        mimeType: 'image/jpeg',
        fileName: 'mamo.jpg',
      }),
    );
    expect(analysisRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: APPT_ID,
        patientId: PATIENT_ID,
        appointmentFileId: FILE_ID,
        prediction: 'MALIGNANT',
        probability: 96.19,
        malignancyProbability: 96.19,
        rawScore: 0.0381,
        threshold: 0.15,
        modelVersion: 'v1',
        status: 'danger',
        rawResponse: { prediction: 'MALIGNO' },
        notes: 'control',
        imagePath: 'u/c/a/img.jpg',
      }),
    );
    expect(out).toMatchObject({ id: 'new-id', malignancyProbability: 96.19, rawScore: 0.0381, notes: 'control' });
  });

  it('un DICOM se convierte a JPEG antes del detector y se guarda ese JPEG', async () => {
    const dicomBytes = Buffer.alloc(200);
    dicomBytes.write('DICM', 128, 'ascii');
    const { service, detector, dicom, analysisRepo, uploads } = setup({ fileBytes: dicomBytes });

    await service.create({ appointmentFileId: FILE_ID }, { id: 'user-A' });

    expect(dicom.renderFrameJpeg).toHaveBeenCalled();
    expect(detector.predict).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: Buffer.from('jpeg-from-dicom'), mimeType: 'image/jpeg', fileName: 'mamo.jpg' }),
    );
    const saved = analysisRepo.create.mock.calls[0][0];
    expect(saved.imageMimeType).toBe('image/jpeg');
    expect(saved.imagePath).toMatch(new RegExp(`^mammography-analyses/${APPT_ID}/.+\\.jpg$`));
    expect(fs.readFileSync(path.join(uploads, saved.imagePath)).toString()).toBe('jpeg-from-dicom');
  });

  it('archivo inexistente → 404 sin llamar al detector', async () => {
    const { service, appointmentFileRepo, detector } = setup();
    appointmentFileRepo.findOne.mockResolvedValue(null);
    await expect(service.create({ appointmentFileId: FILE_ID }, undefined)).rejects.toThrow(NotFoundException);
    expect(detector.predict).not.toHaveBeenCalled();
  });

  it('appointmentId que no corresponde al archivo → 400', async () => {
    const { service } = setup();
    await expect(
      service.create({ appointmentFileId: FILE_ID, appointmentId: PATIENT_ID }, undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('un médico no analiza archivos de citas ajenas → 403', async () => {
    const { service, detector, analysisRepo } = setup({ scopedDoctorId: 'doc-A', appointmentDoctorId: 'doc-B' });
    await expect(service.create({ appointmentFileId: FILE_ID }, { id: 'user-A' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(detector.predict).not.toHaveBeenCalled();
    expect(analysisRepo.save).not.toHaveBeenCalled();
  });

  it('error del detector → se propaga y no se guarda nada', async () => {
    const { service, detector, analysisRepo } = setup();
    detector.predict.mockRejectedValue(new PayloadTooLargeException('x'));
    await expect(service.create({ appointmentFileId: FILE_ID }, undefined)).rejects.toThrow(PayloadTooLargeException);
    expect(analysisRepo.save).not.toHaveBeenCalled();
  });
});

describe('MammographyAnalysisService.preview', () => {
  it('devuelve el resultado del detector sin guardar', async () => {
    const { service, analysisRepo } = setup();
    const out = await service.preview({ buffer: Buffer.from([1]), mimetype: 'image/png', originalname: 'a.png' } as any);
    expect(out).toEqual({
      prediction: 'MALIGNANT',
      probability: 96.1880549788475,
      malignancyProbability: 96.1880549788475,
      rawScore: 0.0381,
      threshold: 0.15,
      modelVersion: 'v1',
      status: 'danger',
      label: 'Neoplasia Maligna (BI-RADS 4/5)',
    });
    expect(analysisRepo.save).not.toHaveBeenCalled();
  });

  it('sin archivo → 400', async () => {
    await expect(setup().service.preview(undefined)).rejects.toThrow(BadRequestException);
  });
});

describe('CreateMammographyAnalysisDto con el ValidationPipe real (M-39)', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const validate = (body: object) =>
    pipe.transform(body, { type: 'body', metatype: CreateMammographyAnalysisDto });

  it('acepta appointmentFileId + notes', async () => {
    await expect(validate({ appointmentFileId: FILE_ID, notes: 'x' })).resolves.toMatchObject({
      appointmentFileId: FILE_ID,
      notes: 'x',
    });
  });

  it.each(['prediction', 'probability', 'status', 'rawResponseJson', 'malignancyProbability'])(
    'rechaza %s enviado por el cliente con 400',
    async (field) => {
      const err = await validate({ appointmentFileId: FILE_ID, [field]: 'MALIGNANT' }).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify(err.getResponse())).toContain(`${field} lo calcula el servidor`);
    },
  );

  it('sin appointmentFileId → 400', async () => {
    await expect(validate({ notes: 'x' })).rejects.toThrow(BadRequestException);
  });
});
