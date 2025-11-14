import { SetMetadata } from '@nestjs/common';

/**
 * Constante que define la clave bajo la cual se almacenarán los metadatos
 * de permisos dentro del contexto de NestJS.
 */
export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorador personalizado: @Permission()
 *
 * Permite asignar uno o varios permisos a un handler o controlador.
 *
 * Ejemplos:
 *  @Permission('videos.view')
 *  @Permission('videos.create', 'videos.delete')
 */
export const Permission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
