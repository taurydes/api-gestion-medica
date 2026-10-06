import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import * as fs from 'fs';
import * as multer from 'multer';
import { randomUUID } from 'crypto';
import { Observable, catchError, throwError } from 'rxjs';
import { resolveUploadPath } from './upload-path.util';

export const MB = 1024 * 1024;

/** Same cap as the detector's `/predict`: a larger raster image cannot be analyzed. */
export const ANALYSIS_IMAGE_MAX_BYTES = 20 * MB;

/** Profile and doctor photos (PNG, JPEG or WebP, stored as WebP). */
export const PHOTO_MAX_BYTES = 5 * MB;

/** DICOM needs the whole buffer in memory to parse; 100 MB bounds that peak. */
export const DICOM_MAX_BYTES = 100 * MB;

export function tooLargeMessage(maxBytes: number): string {
  return `El archivo supera el tamaño máximo permitido (${Math.round(maxBytes / MB)} MB).`;
}

/** Multer's own text for LIMIT_FILE_SIZE; only that error carries this interceptor's limit. */
const MULTER_FILE_TOO_LARGE = 'File too large';

/** Replaces multer's English "File too large" with the Spanish message and the limit; other 413s keep theirs. */
@Injectable()
export class UploadLimitMessageInterceptor implements NestInterceptor {
  constructor(private readonly maxBytes: number) {}

  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err) =>
        throwError(() =>
          err instanceof PayloadTooLargeException && err.message === MULTER_FILE_TOO_LARGE
            ? new PayloadTooLargeException(tooLargeMessage(this.maxBytes))
            : err,
        ),
      ),
    );
  }
}

/** Single-file upload with a hard size limit (memory storage unless `options.storage` says otherwise). */
export function FileUpload(field: string, maxBytes: number, options: MulterOptions = {}) {
  return applyDecorators(
    UseInterceptors(
      new UploadLimitMessageInterceptor(maxBytes),
      FileInterceptor(field, {
        storage: multer.memoryStorage(),
        ...options,
        limits: { ...options.limits, fileSize: maxBytes, files: 1 },
      }),
    ),
  );
}

/** Multer disk storage in `uploads/.tmp`; the service moves the file to its final folder. */
export function uploadTmpStorage(): multer.StorageEngine {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        const dir = resolveUploadPath(process.env.UPLOADS_PATH || 'uploads', '.tmp');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err as Error, '');
      }
    },
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.upload`),
  });
}
