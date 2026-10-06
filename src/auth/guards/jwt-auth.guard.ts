import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { extractAccessToken } from '../utils/extract-access-token';

/**
 * Guard: JwtAuthGuard
 *
 * Valida la autenticación mediante un token JWT.
 * Permite acceso a rutas públicas (decoradas con @Public()).
 * Sin token o con token inválido responde 401; el 403 queda para la falta de permiso (PermissionsGuard).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Verifica si la ruta está marcada como pública
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();

    // Bearer header first, then the access_token cookie
    const token = extractAccessToken(request);

    if (!token) {
      throw new UnauthorizedException('Token requerido para esta petición');
    }

    // Verificar y decodificar JWT
    try {
      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
      (request as any).user = decoded; // Añadir payload al request
      (request as any).accessToken = token; 
      return true;
    } catch (error) {
      throw new UnauthorizedException(
        'Token inválido o expirado. Por favor, inicie sesión nuevamente.',
      );
    }
  }
}
