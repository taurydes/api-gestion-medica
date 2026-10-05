import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { authContextForUsers, SCOPE_USERS } from '../../test/auth-context-stub';
import { FakeQueue } from '../../test/fake-queue';
import { RECIPE_FIXTURE } from '../../test/recipe-pdf-fixture';
import { DEFAULT_PDF_CONCURRENCY, pdfConcurrency, RECIPE_PDF_JOB, toJobStatus } from './documents.const';
import { DocumentsProcessor, PDF_FAILED } from './documents.processor';
import { DocumentsService, FILE_NOT_READY, JOB_FORBIDDEN, JOB_NOT_FOUND } from './documents.service';
import { RecipePdfService } from './recipe-pdf.service';

const RECIPE_ID = RECIPE_FIXTURE.id;

function setup() {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'documents-spec-'));
  const recipe = { ...RECIPE_FIXTURE, updatedAt: new Date('2026-10-05T10:00:00.000Z'), deletedAt: null };
  const recipeRepo = {
    findOne: jest.fn(async ({ where }: any) => (where.id === recipe.id ? recipe : null)),
  };
  const config = { get: (key: string) => (key === 'UPLOADS_PATH' ? uploadsDir : undefined) };
  const recipePdf = new RecipePdfService(recipeRepo as any, config as any);
  const documentsQueue = new FakeQueue('documents');
  const emailQueue = new FakeQueue('email');
  const service = new DocumentsService(
    documentsQueue as any,
    emailQueue as any,
    authContextForUsers(SCOPE_USERS),
    recipePdf,
  );
  const processor = new DocumentsProcessor(recipePdf, config as any);
  return { uploadsDir, recipe, recipeRepo, recipePdf, documentsQueue, emailQueue, service, processor };
}

/** Runs the queued job through the real processor and moves it to the state BullMQ would. */
async function work(processor: DocumentsProcessor, job: any) {
  job.state = 'active';
  try {
    job.returnvalue = await processor.process(job);
    job.state = 'completed';
  } catch (error) {
    job.failedReason = (error as Error).message;
    job.state = 'failed';
  }
}

describe('Documents queue — recipe PDF', () => {
  it('enqueue answers {jobId, status: queued} and the job carries only ids', async () => {
    const { service, documentsQueue } = setup();
    const result = await service.enqueueRecipePdf(RECIPE_ID, 'user-b');

    expect(result).toEqual({ jobId: expect.any(String), status: 'queued' });
    const job = await documentsQueue.getJob(result.jobId);
    expect(job?.name).toBe(RECIPE_PDF_JOB);
    expect(job?.data).toEqual({ recipeId: RECIPE_ID, requesterId: 'user-b' });
  });

  it('the worker writes uploads/documents/<recipeId>.pdf and the requester downloads it', async () => {
    const { service, processor, documentsQueue, uploadsDir } = setup();
    const { jobId } = await service.enqueueRecipePdf(RECIPE_ID, 'user-b');

    await expect(service.getFile(jobId, 'user-b')).rejects.toThrow(FILE_NOT_READY);
    await work(processor, await documentsQueue.getJob(jobId));

    await expect(service.getStatus(jobId, 'user-b')).resolves.toEqual({ jobId, status: 'done' });
    const file = await service.getFile(jobId, 'user-b');
    expect(file.path).toBe(path.resolve(uploadsDir, 'documents', `${RECIPE_ID}.pdf`));
    expect(fs.readFileSync(file.path).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('reuses the file while the recipe is unchanged and regenerates it after an update', async () => {
    const { recipePdf, recipe } = setup();
    expect((await recipePdf.ensurePdf(RECIPE_ID)).cached).toBe(false);
    expect((await recipePdf.ensurePdf(RECIPE_ID)).cached).toBe(true);

    recipe.updatedAt = new Date('2026-10-05T11:00:00.000Z');
    expect((await recipePdf.ensurePdf(RECIPE_ID)).cached).toBe(false);
    expect((await recipePdf.ensurePdf(RECIPE_ID)).cached).toBe(true);
  });

  it('a deleted recipe fails without retries and with a readable error', async () => {
    const { service, processor, documentsQueue } = setup();
    const { jobId } = await service.enqueueRecipePdf('3f1c5a60-0000-4000-8000-000000000000', 'user-b');
    const job = await documentsQueue.getJob(jobId);

    await expect(processor.process(job as any)).rejects.toThrow(UnrecoverableError);
    await work(processor, job);
    await expect(service.getStatus(jobId, 'user-b')).resolves.toEqual({
      jobId,
      status: 'failed',
      error: expect.stringContaining('no encontrada'),
    });
    await expect(service.getFile(jobId, 'user-b')).rejects.toThrow(ConflictException);
  });

  it('an unexpected failure is retried and reports a generic message, not internals', async () => {
    const { service, processor, documentsQueue, recipeRepo } = setup();
    recipeRepo.findOne.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const { jobId } = await service.enqueueRecipePdf(RECIPE_ID, 'user-b');
    const job = await documentsQueue.getJob(jobId);

    await expect(processor.process(job as any)).rejects.not.toThrow(UnrecoverableError);
    recipeRepo.findOne.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    await work(processor, job);
    expect(job?.failedReason).toBe(PDF_FAILED);
  });
});

describe('Documents jobs — only the requester or an admin', () => {
  it('another doctor gets 403 on status and file', async () => {
    const { service } = setup();
    const { jobId } = await service.enqueueRecipePdf(RECIPE_ID, 'user-b');

    await expect(service.getStatus(jobId, 'user-a')).rejects.toThrow(ForbiddenException);
    await expect(service.getStatus(jobId, 'user-a')).rejects.toThrow(JOB_FORBIDDEN);
    await expect(service.getFile(jobId, 'user-a')).rejects.toThrow(ForbiddenException);
  });

  it('an admin sees any job', async () => {
    const { service } = setup();
    const { jobId } = await service.enqueueRecipePdf(RECIPE_ID, 'user-b');
    await expect(service.getStatus(jobId, 'user-admin')).resolves.toEqual({ jobId, status: 'queued' });
  });

  it('an unknown job is 404', async () => {
    const { service } = setup();
    await expect(service.getStatus('9b2e0d1a-0000-4000-8000-000000000000', 'user-b')).rejects.toThrow(JOB_NOT_FOUND);
  });

  it('email jobs answer status through the same endpoint but have no file', async () => {
    const { service, emailQueue } = setup();
    await emailQueue.add('recipe-email', { requesterId: 'user-b' }, { jobId: 'mail-1' });

    await expect(service.getStatus('mail-1', 'user-b')).resolves.toEqual({ jobId: 'mail-1', status: 'queued' });
    await expect(service.getFile('mail-1', 'user-b')).rejects.toThrow(NotFoundException);
  });
});

describe('Documents queue settings', () => {
  it.each([
    ['active', 'processing'],
    ['completed', 'done'],
    ['failed', 'failed'],
    ['waiting', 'queued'],
    ['delayed', 'queued'],
    ['waiting-children', 'queued'],
  ])('BullMQ state %s → %s', (state, status) => {
    expect(toJobStatus(state)).toBe(status);
  });

  it('PDF_CONCURRENCY falls back to the default when missing or invalid', () => {
    expect(pdfConcurrency('4')).toBe(4);
    expect(pdfConcurrency(undefined)).toBe(DEFAULT_PDF_CONCURRENCY);
    expect(pdfConcurrency('0')).toBe(DEFAULT_PDF_CONCURRENCY);
    expect(pdfConcurrency('abc')).toBe(DEFAULT_PDF_CONCURRENCY);
  });
});
