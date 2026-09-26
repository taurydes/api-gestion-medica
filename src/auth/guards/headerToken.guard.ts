import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Guard: HeaderTokenGuard
 * 
 * Valida que la solicitud incluya un header `token` con el valor
 * definido en la variable de entorno `TOKEN_VALIDATOR`.
 * Si el token no coincide, responde 401 (No autorizado).
 */
@Injectable()
export class HeaderTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    // Token esperado desde las variables de entorno
    const token = process.env.TOKEN_VALIDATOR;

    // Token recibido en los headers (acepta distintas capitalizaciones)
    const headerParam =
      req.headers['token'] || req.headers['Token'] || req.headers['TOKEN'];

    // Valida coincidencia
    if (headerParam === token) {
      return true;
    }

    throw new UnauthorizedException('No autorizado');
  }
}
