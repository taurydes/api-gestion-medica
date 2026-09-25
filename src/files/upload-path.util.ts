import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import * as path from 'path';

/** Carpeta usada cuando una subida no trae dueño (`ownerId`/`personId`). */
export const GENERAL_FOLDER = 'general';

/**
 * Resuelve una ruta dentro de la raíz de subidas y rechaza cualquier salida de ella.
 * Todas las lecturas y escrituras de `files` pasan por aquí.
 */
export function resolveUploadPath(
  uploadsDir: string,
  ...segments: string[]
): string {
  const root = path.resolve(process.cwd(), uploadsDir);
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new BadRequestException('Ruta de archivo no permitida.');
  }
  return target;
}

/** Nombre de archivo sin directorios; rechaza `..`, separadores y bytes nulos. */
export function assertSafeFileName(name: string, field = 'nombre de archivo'): string {
  const value = typeof name === 'string' ? name.trim() : '';
  if (
    !value ||
    value === '.' ||
    value === '..' ||
    value.includes('\0') ||
    path.basename(value) !== value ||
    /[/\\]/.test(value)
  ) {
    throw new BadRequestException(`El ${field} no es válido.`);
  }
  return value;
}

/** Id usado como carpeta: debe ser UUID (o `general` cuando se permite). */
export function assertFolderId(
  value: string,
  field: string,
  allowGeneral = false,
): string {
  if (allowGeneral && value === GENERAL_FOLDER) return value;
  if (typeof value !== 'string' || !isUUID(value)) {
    throw new BadRequestException(`${field} debe ser un UUID válido.`);
  }
  return value;
}
