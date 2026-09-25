import {
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import {
  UserAccess,
  UserAccessService,
} from 'src/common/services/user-access.service';
import { RedisSessionService } from 'src/redis-session/redis-session.service';

/**
 * Autoriza el acceso a paneles HTML fuera del pipeline de Nest (Bull Board, vista de logs).
 * Valida JWT + sesión Redis y exige un permiso del rol leído desde la BD.
 */
@Injectable()
export class PanelAccessService {
  private readonly logger = new Logger(PanelAccessService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisSession: RedisSessionService,
    private readonly userAccessService: UserAccessService,
    private readonly configService: ConfigService,
  ) {}

  /** Token desde `Authorization: Bearer`, o desde las cookies que dejan las vistas de login. */
  extractToken(req: Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    return cookies.access_token || cookies.bull_token || undefined;
  }

  async authorize(
    token: string | undefined,
    permission: string,
  ): Promise<UserAccess> {
    if (!token) {
      throw new UnauthorizedException('Token requerido para esta petición');
    }

    let userId: string | undefined;
    try {
      const decoded = this.jwtService.verify<{ id?: string }>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
      userId = decoded?.id;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (!userId) throw new UnauthorizedException('Token inválido o expirado');

    const sessionOk = await this.redisSession.isValidSessionToken(userId, token);
    if (!sessionOk) {
      throw new UnauthorizedException('Sesión expirada o cerrada');
    }

    const access = await this.userAccessService.resolve(userId);
    if (!access?.isActive || !access.permissions.includes(permission)) {
      throw new ForbiddenException('No tiene permisos para acceder a este panel');
    }
    return access;
  }

  /** Middleware Express: navegación HTML → redirige al login; API → JSON 401/403. */
  middleware(permission: string, loginPath: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        await this.authorize(this.extractToken(req), permission);
        next();
      } catch (err) {
        const status = err instanceof HttpException ? err.getStatus() : 500;
        if (status === 500) {
          this.logger.error('Fallo inesperado al autorizar el panel', err?.stack);
        }
        const message =
          err instanceof HttpException ? err.message : 'Error de autorización';
        const wantsHtml =
          req.method === 'GET' &&
          (req.headers.accept ?? '').includes('text/html');
        if (wantsHtml) {
          return res.redirect(
            `${loginPath}?error=${encodeURIComponent(message)}`,
          );
        }
        return res.status(status).json({ data: null, error: message, statusCode: status });
      }
    };
  }
}
