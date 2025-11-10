import { SetMetadata } from '@nestjs/common';

/**
 * Constante que define la clave bajo la cual se almacenarán los metadatos
 * de permisos dentro del contexto de NestJS.
 *
 * Esta clave se utiliza posteriormente por el guard `PermissionsGuard`
 * para recuperar la información de permisos requerida en cada ruta o método.
 */
export const PERMISSION_KEY = 'permissions';

/**
 * Decorador personalizado: @Permission()
 *
 * Permite asignar permisos específicos a controladores o endpoints.
 * Estos permisos se almacenan como metadatos en el contexto del manejador,
 * y luego pueden ser leídos por un guard (por ejemplo, `PermissionsGuard`)
 * para validar si el usuario autenticado posee los permisos necesarios.
 *
 * @param permissions - Uno o varios permisos requeridos para acceder al recurso.
 *
 * @example
 * ```ts
 * @Permission('read_users')
 * @Get('users')
 * getUsers() {
 *   ...
 * }
 *
 * @Permission(['create_user', 'edit_user'])
 * @Post('users')
 * createUser() {
 *   ...
 * }
 * ```
 *
 * Internamente utiliza el decorador `SetMetadata` de NestJS para asociar los permisos
 * a la metadata del método o clase donde se aplica.
 */
export const Permission = (permissions: string | string[]) =>
  SetMetadata(
    PERMISSION_KEY,
    Array.isArray(permissions) ? permissions : [permissions],
  );
