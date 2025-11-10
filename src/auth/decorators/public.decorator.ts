import { SetMetadata } from '@nestjs/common';

/**
 * Constante que define la clave usada para marcar un endpoint como público.
 *
 * Esta clave (`isPublic`) se asocia a un manejador (handler) o controlador
 * mediante el decorador `@Public()`. Posteriormente, los guards (por ejemplo,
 * `JwtAuthGuard`) pueden verificar si el endpoint tiene esta metadata y, en ese caso,
 * omitir la verificación de autenticación.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorador personalizado: @Public()
 *
 * Marca un endpoint o controlador como público, es decir, exento de autenticación.
 * Los guards deben estar configurados para ignorar la validación JWT o de permisos
 * cuando detecten este metadato.
 *
 * @example
 * ```ts
 * @Public()
 * @Get('login')
 * login() {
 *   // Ruta pública, no requiere autenticación
 * }
 * ```
 *
 * Internamente utiliza el decorador `SetMetadata` de NestJS
 * para registrar la propiedad `isPublic` con valor `true`.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
