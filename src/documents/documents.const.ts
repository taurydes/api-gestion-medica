import { JobsOptions } from 'bullmq';

export const DOCUMENTS_QUEUE = 'documents';
export const EMAIL_QUEUE = 'email';
export const RECIPE_PDF_JOB = 'recipe-pdf';

/** Folder under the uploads root where generated PDFs live (uploads/documents/<recipeId>.pdf). */
export const DOCUMENTS_FOLDER = 'documents';

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface RecipePdfJobData {
  recipeId: string;
  requesterId: string;
}

export interface RecipePdfJobResult {
  recipeId: string;
  cached: boolean;
  recipeNumber: string;
}

/** Retries with backoff; finished jobs are pruned so Redis does not grow without bound. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 60 * 60, count: 500 },
  removeOnFail: { age: 24 * 60 * 60, count: 500 },
};

/** BullMQ state → the four statuses of the public contract; a retry waiting its backoff is still "queued". */
export function toJobStatus(state: string): JobStatus {
  if (state === 'active') return 'processing';
  if (state === 'completed') return 'done';
  if (state === 'failed') return 'failed';
  return 'queued';
}

/** failedReason as the client sees it: BullMQ's "child ... failed" names internal keys. */
export function publicFailedReason(reason: string | undefined): string {
  if (!reason) return 'El trabajo falló.';
  return /^child .* failed/i.test(reason)
    ? 'No se pudo generar el PDF adjunto.'
    : reason;
}

export const DEFAULT_PDF_CONCURRENCY = 2;

/** Worker concurrency from PDF_CONCURRENCY; anything unparsable falls back to the default. */
export function pdfConcurrency(raw: unknown): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1
    ? value
    : DEFAULT_PDF_CONCURRENCY;
}
