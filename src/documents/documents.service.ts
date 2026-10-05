import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { AuthContextService } from 'src/common/services/auth-context.service';
import {
  DOCUMENTS_QUEUE,
  EMAIL_QUEUE,
  JobStatus,
  RECIPE_PDF_JOB,
  publicFailedReason,
  RecipePdfJobData,
  toJobStatus,
} from './documents.const';
import { RecipePdfService } from './recipe-pdf.service';

export interface JobStatusView {
  jobId: string;
  status: JobStatus;
  error?: string;
}

export const JOB_NOT_FOUND = 'Trabajo no encontrado o ya expirado.';
export const JOB_FORBIDDEN =
  'Solo quien solicitó el trabajo o un administrador puede consultarlo.';
export const FILE_NOT_READY = 'El documento aún no está listo.';

/** Enqueues document jobs and answers their status and file to the requester or an admin. */
@Injectable()
export class DocumentsService {
  constructor(
    @InjectQueue(DOCUMENTS_QUEUE) private readonly documentsQueue: Queue,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
    private readonly authContext: AuthContextService,
    private readonly recipePdf: RecipePdfService,
  ) {}

  /** The caller checks the recipe scope first; the job only carries ids. */
  async enqueueRecipePdf(
    recipeId: string,
    requesterId: string,
  ): Promise<{ jobId: string; status: JobStatus }> {
    const jobId = randomUUID();
    const data: RecipePdfJobData = { recipeId, requesterId };
    await this.documentsQueue.add(RECIPE_PDF_JOB, data, { jobId });
    return { jobId, status: 'queued' };
  }

  /** Status of a documents or email job (both queues share this endpoint). */
  async getStatus(jobId: string, userId: string): Promise<JobStatusView> {
    const job = await this.findOwnedJob(jobId, userId);
    const status = toJobStatus(await job.getState());
    return status === 'failed'
      ? { jobId, status, error: publicFailedReason(job.failedReason) }
      : { jobId, status };
  }

  /** Absolute path of a finished recipe PDF; 409 while it is not done. */
  async getFile(
    jobId: string,
    userId: string,
  ): Promise<{ path: string; fileName: string }> {
    const job = await this.findOwnedJob(jobId, userId);
    if (job.queueName !== DOCUMENTS_QUEUE || job.name !== RECIPE_PDF_JOB) {
      throw new NotFoundException('Este trabajo no genera un archivo.');
    }
    if (toJobStatus(await job.getState()) !== 'done') {
      throw new ConflictException(FILE_NOT_READY);
    }
    const { recipeId } = job.data as RecipePdfJobData;
    const path = this.recipePdf.filePath(recipeId);
    if (!(await fs.stat(path).catch(() => null))) {
      throw new NotFoundException(
        'El archivo ya no está disponible; solicítelo de nuevo.',
      );
    }
    return { path, fileName: `receta-${recipeId}.pdf` };
  }

  private async findOwnedJob(jobId: string, userId: string): Promise<Job> {
    const job =
      (await this.documentsQueue.getJob(jobId)) ??
      (await this.emailQueue.getJob(jobId));
    if (!job) throw new NotFoundException(JOB_NOT_FOUND);
    if (
      job.data?.requesterId !== userId &&
      !(await this.authContext.isAdmin(userId))
    ) {
      throw new ForbiddenException(JOB_FORBIDDEN);
    }
    return job;
  }
}
