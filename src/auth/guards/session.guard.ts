import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisSessionService } from 'src/redis-session/redis-session.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * @summary Guard de sesión de usuario.
 * @description
 * Este guard se encarga de verificar que la sesión del usuario
 * siga activa en Redis, complementando la validación JWT.
 *
 * Se ejecuta **después del JwtAuthGuard**, asegurando que:
 * 1. El token JWT ya haya sido validado y decodificado.
 * 2. El usuario (`req.user`) esté disponible en el contexto.
 *
 * Si la sesión expiró, fue cerrada manualmente o no existe en Redis,
 * el acceso será denegado con un `401 Unauthorized`.
 *
 * También respeta las rutas marcadas con el decorador `@Public()`,
 * permitiendo acceso sin autenticación en esos casos.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly redisSession: RedisSessionService,
    private readonly reflector: Reflector,
  ) {}

  /**
   * @summary Verifica si la sesión del usuario sigue activa.
   * @description
   * - Omite la validación si la ruta está marcada como pública (`@Public()`).
   * - Requiere que el usuario ya esté autenticado por el `JwtAuthGuard`.
   * - Comprueba en Redis si la sesión (`user.id`) aún está activa.
   *
   * @param context Contexto de ejecución HTTP.
   * @returns `true` si la sesión es válida; lanza excepción si no lo es.
   *
   * @throws {UnauthorizedException} Si el usuario no está autenticado.
   * @throws {UnauthorizedException} Si la sesión expiró o fue eliminada.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 🔹 1. Verificar si la ruta es pública
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
      // 🔹 2. Obtener la request y validar existencia del usuario
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user || !user.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    const accessToken = req.accessToken;
    // 🔹 3. Consultar si la sesión del usuario sigue activa en Redis
    const isValid = await this.redisSession.isValidSessionToken(
      user.id,
      accessToken,
    );

    if (!isValid) {
      throw new UnauthorizedException('Sesión expirada o cerrada');
    }

    return true;
  }
}
