import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard: JwtAuthGuard
 *
 * Valida la autenticación mediante un token JWT.
 * Permite acceso a rutas públicas (decoradas con @Public()).
 * Si no hay token o es inválido, lanza excepción 403 o 401.
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

    // Intentar obtener el token desde el header Authorization
    let token: string | null = null;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // Si no está en el header, buscar en las cookies
    if (!token && request.headers.cookie) {
      const rawCookie = request.headers.cookie;
      const cookies = Object.fromEntries(
        rawCookie.split(';').map((c) => {
          const [key, ...v] = c.trim().split('=');
          return [key, decodeURIComponent(v.join('='))];
        }),
      );
      token = cookies['access_token'];
    }

    // Si no se encontró token → 403
    if (!token) {
      throw new HttpException(
        { message: 'Token requerido para esta petición', code: 403 },
        HttpStatus.FORBIDDEN,
      );
    }

    // Verificar y decodificar JWT
    try {
      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || process.env.JWTKEY_VALIDATOR,
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
