import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { detectFileType } from 'src/files/file-signature';

import {
  MammographyAnalysisPrediction,
  MammographyAnalysisStatus,
} from '../entities/mammography-analysis.entity';

/** Result of `POST /predict`, normalized to the backend enums. */
export interface DetectorResult {
  prediction: MammographyAnalysisPrediction;
  /** Model confidence in the predicted class (0-100). */
  probability: number;
  label: string | null;
  status: MammographyAnalysisStatus;
  /** Raw sigmoid output (0-1), kept to recompute if the class order changes. */
  rawScore: number;
  /** Probability of malignancy (0-100). */
  malignancyProbability: number;
  threshold: number | null;
  modelVersion: string | null;
  /** Detector body as received, persisted for audit. */
  raw: Record<string, unknown>;
}

export interface DetectorImage {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export const DETECTOR_MESSAGES = {
  unavailable: 'El servicio de análisis no está disponible.',
  corrupt: 'La imagen está dañada o no se puede leer.',
  tooLarge: 'La imagen supera el tamaño máximo permitido para el análisis (20 MB).',
  unsupported: 'Formato de archivo no soportado para el análisis.',
  outOfDomain: 'La imagen no parece una mamografía válida para el modelo.',
} as const;

const PREDICTIONS: Record<string, MammographyAnalysisPrediction> = {
  MALIGNO: MammographyAnalysisPrediction.MALIGNANT,
  MALIGNANT: MammographyAnalysisPrediction.MALIGNANT,
  BENIGNO: MammographyAnalysisPrediction.BENIGN,
  BENIGN: MammographyAnalysisPrediction.BENIGN,
};

/** HTTP client for the breast cancer detector; maps its failures to domain errors in Spanish. */
@Injectable()
export class DetectorClient {
  private readonly logger = new Logger(DetectorClient.name);
  private readonly predictUrl: string;
  private readonly secret: string;
  private readonly timeoutMs: number;

  constructor(configService: ConfigService) {
    const base = configService.get<string>('DETECTOR_URL') ?? '';
    this.predictUrl = `${base.replace(/\/+$/, '')}/predict`;
    this.secret = configService.get<string>('DETECTOR_SECRET') ?? '';
    this.timeoutMs = Number(configService.get('DETECTOR_TIMEOUT_MS') ?? 30000);
  }

  async predict(image: DetectorImage): Promise<DetectorResult> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(image.buffer)], { type: sniffMimeType(image.buffer, image.mimeType) }),
      image.fileName,
    );

    let response: Response;
    try {
      response = await fetch(this.predictUrl, {
        method: 'POST',
        headers: { 'X-Detector-Secret': this.secret },
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.logger.error(`Detector unreachable or timed out: ${(err as Error)?.name} ${(err as Error)?.message}`);
      throw new ServiceUnavailableException(DETECTOR_MESSAGES.unavailable);
    }

    if (!response.ok) {
      throw this.mapError(response.status, await this.safeText(response));
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      this.logger.error('Detector answered 200 with a non-JSON body');
      throw new ServiceUnavailableException(DETECTOR_MESSAGES.unavailable);
    }
    return this.normalize(body);
  }

  private mapError(status: number, detail: string): HttpException {
    this.logger.warn(`Detector answered ${status}: ${detail.slice(0, 300)}`);
    switch (status) {
      case 400:
        return new BadRequestException(DETECTOR_MESSAGES.corrupt);
      case 413:
        return new PayloadTooLargeException(DETECTOR_MESSAGES.tooLarge);
      case 415:
        return new UnsupportedMediaTypeException(DETECTOR_MESSAGES.unsupported);
      case 422:
        return new UnprocessableEntityException(DETECTOR_MESSAGES.outOfDomain);
      default:
        // 401/403 = wrong shared secret (our misconfiguration), 5xx = detector down: never expose either.
        if (status === 401 || status === 403) {
          this.logger.error('Detector rejected the shared secret: check DETECTOR_SECRET');
        }
        return new ServiceUnavailableException(DETECTOR_MESSAGES.unavailable);
    }
  }

  private normalize(body: unknown): DetectorResult {
    const b = (body ?? {}) as Record<string, unknown>;
    const prediction = PREDICTIONS[String(b.prediction ?? '').trim().toUpperCase()];
    const status = String(b.status ?? '').trim().toLowerCase() as MammographyAnalysisStatus;
    const expectedStatus =
      prediction === MammographyAnalysisPrediction.MALIGNANT
        ? MammographyAnalysisStatus.DANGER
        : MammographyAnalysisStatus.SUCCESS;

    const valid =
      !!prediction &&
      status === expectedStatus &&
      inRange(b.probability, 0, 100) &&
      inRange(b.rawScore, 0, 1) &&
      inRange(b.malignancyProbability, 0, 100) &&
      (b.threshold === undefined || b.threshold === null || inRange(b.threshold, 0, 1)) &&
      (b.modelVersion === undefined || b.modelVersion === null || typeof b.modelVersion === 'string');

    if (!valid) {
      this.logger.error(`Detector answered an unexpected body: ${JSON.stringify(b).slice(0, 300)}`);
      throw new ServiceUnavailableException(DETECTOR_MESSAGES.unavailable);
    }

    return {
      prediction,
      probability: b.probability as number,
      label: typeof b.label === 'string' ? b.label : null,
      status,
      rawScore: b.rawScore as number,
      malignancyProbability: b.malignancyProbability as number,
      threshold: (b.threshold as number | null | undefined) ?? null,
      modelVersion: (b.modelVersion as string | null | undefined) ?? null,
      raw: b,
    };
  }

  private async safeText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** The detector whitelists by content type: trust the bytes over a browser-sent `octet-stream` or `image/jpg`. */
export function sniffMimeType(buffer: Buffer, declared: string): string {
  const detected = detectFileType(buffer);
  if (detected === 'image/jpeg' || detected === 'image/png' || detected === 'image/webp') return detected;
  return declared === 'image/jpg' ? 'image/jpeg' : declared;
}
