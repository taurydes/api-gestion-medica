import { ConflictException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MammographyAnalysisService } from './mammography-analysis.service';
import { CreateMammographyAnalysisDto } from './dto/create-mammography-analysis.dto';
import { ReviewMammographyAnalysisDto } from './dto/review-mammography-analysis.dto';
import { DeleteMammographyAnalysisDto } from './dto/delete-mammography-analysis.dto';
import { authContextForUsers, SCOPE_USERS } from '../../test/auth-context-stub';

const FILE_ID = '11111111-1111-4111-8111-111111111111';
const APPT_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_ID = '33333333-3333-4333-8333-333333333333';

/** Real service over an in-memory analysis table; the appointment belongs to doc-a. */
function build(analyses: any[] = []) {
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'mammo-rules-'));
  fs.mkdirSync(path.join(uploads, 'u'), { recursive: true });
  fs.writeFileSync(path.join(uploads, 'u/img.jpg'), Buffer.from([0xff, 0xd8, 0xff, 1, 2]));
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([k, v]: [string, any]) => (v?.type === 'isNull' ? row[k] == null : row[k] === v));
  const analysisRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      const row = analyses.find((a) => matches(a, where));
      return row ? { ...row, appointment: { doctorId: 'doc-a' } } : null;
    }),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => {
      const saved = { id: x.id ?? `an-${analyses.length + 1}`, createdAt: new Date(), ...x };
      const i = analyses.findIndex((a) => a.id === saved.id);
      if (i >= 0) analyses[i] = { ...analyses[i], ...saved };
      else analyses.push(saved);
      return saved;
    }),
    update: jest.fn(async (id: string, patch: any) => Object.assign(analyses.find((a) => a.id === id), patch)),
  };
  const apptFile = { id: FILE_ID, appointmentId: APPT_ID, patientId: PATIENT_ID, filePath: 'u/img.jpg', mimeType: 'image/jpeg' };
  const detector = {
    predict: jest.fn().mockResolvedValue({
      prediction: 'BENIGN', probability: 80, malignancyProbability: 20, rawScore: 0.8, threshold: 0.15,
      modelVersion: 'v1', status: 'success', label: 'x', raw: {},
    }),
  };
  const service = new MammographyAnalysisService(
    analysisRepo as any,
    { findOne: jest.fn().mockResolvedValue(apptFile) } as any,
    { findOne: jest.fn().mockResolvedValue({ id: APPT_ID, doctorId: 'doc-a', patientId: PATIENT_ID }) } as any,
    { exists: jest.fn().mockResolvedValue(true) } as any,
    { get: (k: string) => (k === 'UPLOADS_PATH' ? uploads : undefined) } as any,
    authContextForUsers(SCOPE_USERS),
    detector as any,
    {} as any,
  );
  return { service, analyses, detector, analysisRepo };
}

const live = (extra: Record<string, unknown> = {}) => ({
  id: 'an-1', appointmentId: APPT_ID, appointmentFileId: FILE_ID, patientId: PATIENT_ID, probability: 80,
  isReviewed: false, deletedAt: null, ...extra,
});
const pipe = new ValidationPipe({ whitelist: true, transform: true });

describe('One live analysis per appointment file (MJ-44)', () => {
  it('a second request for the same file returns the existing analysis without calling the model', async () => {
    const { service, analyses, detector } = build([live()]);

    const out = await service.create({ appointmentFileId: FILE_ID }, { id: 'user-a' });

    expect(out.id).toBe('an-1');
    expect(detector.predict).not.toHaveBeenCalled();
    expect(analyses).toHaveLength(1);
  });

  it('a race lost on the unique index answers with the winner instead of a 500', async () => {
    const { service, analysisRepo, analyses } = build([]);
    analysisRepo.save.mockImplementationOnce(async () => {
      analyses.push(live({ id: 'winner' }));
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    });

    await expect(service.create({ appointmentFileId: FILE_ID }, { id: 'user-a' })).resolves.toMatchObject({ id: 'winner' });
  });

  it('after a withdrawn analysis the file can be analyzed again', async () => {
    const { service, analyses, detector } = build([live({ deletedAt: new Date() })]);
    await service.create({ appointmentFileId: FILE_ID }, { id: 'user-a' });
    expect(detector.predict).toHaveBeenCalled();
    expect(analyses.filter((a) => !a.deletedAt)).toHaveLength(1);
  });
});

describe('Structured agreement of the doctor and the reviewer (MJ-33)', () => {
  it('the analysis stores doctorAgreement and returns it', async () => {
    const { service, analyses } = build([]);
    const dto = await pipe.transform({ appointmentFileId: FILE_ID, doctorAgreement: 'uncertain' }, { type: 'body', metatype: CreateMammographyAnalysisDto });

    const out = await service.create(dto, { id: 'user-a' });

    expect(analyses[0].doctorAgreement).toBe('uncertain');
    expect(out.doctorAgreement).toBe('uncertain');
  });

  it('the review stores reviewAgreement', async () => {
    const { service, analyses } = build([live()]);
    await service.markReviewed('an-1', { reviewNotes: 'ok', reviewAgreement: 'rejected' }, 'user-a');
    expect(analyses[0]).toMatchObject({ isReviewed: true, reviewAgreement: 'rejected', reviewNotes: 'ok' });
  });

  it.each([
    [CreateMammographyAnalysisDto, { appointmentFileId: FILE_ID, doctorAgreement: 'si' }],
    [ReviewMammographyAnalysisDto, { reviewAgreement: 'maybe' }],
  ])('a value outside accepted/rejected/uncertain → 400', async (metatype, body) => {
    await expect(pipe.transform(body, { type: 'body', metatype })).rejects.toThrow();
  });
});

describe('A review is not overwritten (MJ-34)', () => {
  it('reviewing an already reviewed analysis → 409, first review kept', async () => {
    const first = new Date('2026-10-01T10:00:00Z');
    const { service, analyses } = build([live({ isReviewed: true, reviewedBy: 'user-b', reviewedAt: first, reviewNotes: 'primera' })]);

    await expect(service.markReviewed('an-1', { reviewNotes: 'segunda' }, 'user-a')).rejects.toThrow(ConflictException);
    expect(analyses[0]).toMatchObject({ reviewedBy: 'user-b', reviewedAt: first, reviewNotes: 'primera' });
  });
});

describe('DELETE /mammography-analyses/:id withdraws with a reason (MJ-37)', () => {
  it('the appointment doctor withdraws an unreviewed analysis: soft delete with reason and author', async () => {
    const { service, analyses } = build([live()]);

    await service.remove('an-1', '  Imagen equivocada  ', 'user-a');

    expect(analyses[0].deletedAt).toBeInstanceOf(Date);
    expect(analyses[0]).toMatchObject({ deletionReason: 'Imagen equivocada', deletedBy: 'user-a' });
  });

  it('a reviewed analysis → 409 and stays', async () => {
    const { service, analyses } = build([live({ isReviewed: true })]);
    await expect(service.remove('an-1', 'x', 'user-a')).rejects.toThrow(ConflictException);
    expect(analyses[0].deletedAt).toBeNull();
  });

  it('another doctor → 403', async () => {
    const { service, analyses } = build([live()]);
    await expect(service.remove('an-1', 'x', 'user-b')).rejects.toThrow(ForbiddenException);
    expect(analyses[0].deletedAt).toBeNull();
  });

  it('a blank or whitespace-only reason → 400; a padded one is trimmed', async () => {
    const body = (reason: string) => pipe.transform({ reason }, { type: 'body', metatype: DeleteMammographyAnalysisDto });
    await expect(body('')).rejects.toThrow();
    await expect(body('   ')).rejects.toThrow();
    await expect(body('  Imagen equivocada  ')).resolves.toEqual({ reason: 'Imagen equivocada' });
  });
});
