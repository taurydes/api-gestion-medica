import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import {
  DOCUMENTS_QUEUE,
  pdfConcurrency,
  RECIPE_PDF_JOB,
  RecipePdfJobData,
  RecipePdfJobResult,
} from './documents.const';
import { RecipePdfService } from './recipe-pdf.service';

export const PDF_FAILED = 'No se pudo generar el documento.';

/** Worker of the `documents` queue; PDF_CONCURRENCY bounds how many PDFs render at once. */
@Processor(DOCUMENTS_QUEUE)
export class DocumentsProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(DocumentsProcessor.name);

  constructor(
    private readonly recipePdf: RecipePdfService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    // Set here and not in @Processor(): the decorator runs before ConfigModule loads .env.
    this.worker.concurrency = pdfConcurrency(
      this.config.get('PDF_CONCURRENCY'),
    );
  }

  async process(job: Job<RecipePdfJobData>): Promise<RecipePdfJobResult> {
    if (job.name !== RECIPE_PDF_JOB) {
      throw new UnrecoverableError(
        `Tipo de documento no soportado: ${job.name}`,
      );
    }
    try {
      const { cached, recipeNumber } = await this.recipePdf.ensurePdf(
        job.data.recipeId,
      );
      return { recipeId: job.data.recipeId, cached, recipeNumber };
    } catch (error) {
      // A deleted recipe will not come back on retry; failedReason reaches the client, so no internals.
      if (error instanceof NotFoundException)
        throw new UnrecoverableError(error.message);
      this.logger.error(
        `Receta ${job.data.recipeId}: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      throw new Error(PDF_FAILED);
    }
  }
}
