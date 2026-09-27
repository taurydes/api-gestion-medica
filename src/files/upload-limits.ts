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
import * as multer from 'multer';
import { Observable, catchError, throwError } from 'rxjs';

export const MB = 1024 * 1024;

/** Same cap as the detector's `/predict`: a larger raster image cannot be analyzed. */
export const ANALYSIS_IMAGE_MAX_BYTES = 20 * MB;

/** DICOM needs the whole buffer in memory to parse; 100 MB bounds that peak. */
export const DICOM_MAX_BYTES = 100 * MB;

export function tooLargeMessage(maxBytes: number): string {
  return `El archivo supera el tamaño máximo permitido (${Math.round(maxBytes / MB)} MB).`;
}

/** Replaces multer's English "File too large" with the Spanish message and the limit. */
@Injectable()
class UploadLimitMessageInterceptor implements NestInterceptor {
  constructor(private readonly maxBytes: number) {}

  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err) =>
        throwError(() =>
          err instanceof PayloadTooLargeException
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
