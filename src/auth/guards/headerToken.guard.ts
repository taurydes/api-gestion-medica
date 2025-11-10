import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

/**
 * Guard: HeaderTokenGuard
 * 
 * Valida que la solicitud incluya un header `token` con el valor
 * definido en la variable de entorno `TOKEN_VALIDATOR`.
 * Si el token no coincide, lanza un error 403 (No autorizado).
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

    // Si el token no es válido, lanza excepción 403
    throw new HttpException(
      { message: 'No autorizado', code: 403 },
      HttpStatus.FORBIDDEN,
    );
  }
}
