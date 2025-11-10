import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard: JwtExternalGuard
 *
 * Valida tokens JWT provenientes de solicitudes externas.
 * Permite acceso a rutas públicas (decoradas con @Public()).
 * Si no hay token o es inválido, lanza excepciones 403 o 403.
 */
@Injectable()
export class JwtExternalGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Permite acceso a rutas públicas
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const jwtKey = process.env.JWTKEY_VALIDATOR || 'default_jwt_key';

    // Obtener token desde el header Authorization
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // Si no se envía token → 403
    if (!token) {
      throw new HttpException(
        { message: 'Token requerido para esta petición', code: 403 },
        HttpStatus.FORBIDDEN,
      );
    }

    // Verificar JWT con la clave configurada
    try {
      const user = jwt.verify(token, jwtKey);
      req.user = user; // Agrega los datos decodificados al request
      return true;
    } catch (err) {
      throw new ForbiddenException(
        'Token inválido. Su sesión ha expirado, por favor inicie sesión nuevamente',
      );
    }
  }
}
