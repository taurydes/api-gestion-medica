import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import * as path from 'path';

@Injectable()
export class VideoValidationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();

    const file = req.file;

    if (!file) {
      throw new BadRequestException('Debe enviar un archivo en el campo "file".');
    }

    // ✔ Validar MIME-Type
    if (file.mimetype !== 'video/mp4') {
      throw new BadRequestException('Solo se permiten archivos de tipo video/mp4.');
    }

    // ✔ Validar extensión
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.mp4') {
      throw new BadRequestException('La extensión del archivo debe ser .mp4.');
    }

    // ✔ Validar tamaño (ej: 20MB)
    const MAX_SIZE_MB = 20;
    const maxSizeBytes = MAX_SIZE_MB * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      throw new BadRequestException(
        `El archivo supera el tamaño máximo permitido de ${MAX_SIZE_MB}MB.`,
      );
    }

    return next.handle();
  }
}
