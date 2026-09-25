import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  UserAccess,
  UserAccessService,
} from 'src/common/services/user-access.service';
import { PERMISSIONS_KEY } from '../decorators/permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userAccessService: UserAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Rutas públicas no requieren permisos
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 1️⃣ Leer permisos desde el decorador @Permission()
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si no requiere permisos → dejar pasar
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // 2️⃣ Obtener al usuario desde req.user (validado por JWT)
    const request = context.switchToHttp().getRequest<Request>();
    const authUser: any = request.user;

    if (!authUser || !authUser.id) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    // 3️⃣ Rol y permisos desde la BD (UserSecurity primero, luego User)
    const cached: UserAccess | undefined = (request as any).userAccess;
    const access =
      cached?.userId === authUser.id
        ? cached
        : await this.userAccessService.resolve(authUser.id);

    if (!access) {
      throw new ForbiddenException(
        'No posee permisos suficientes para el módulo',
      );
    }

    if (!access.isActive) {
      throw new ForbiddenException('El usuario o su rol están inactivos');
    }

    // Inyectar permisos y rol en la request para uso posterior
    (request as any).userPermissions = access.permissions;
    (request as any).userRole = access.role;

    // 4️⃣ Validar que el usuario tenga al menos uno de los permisos requeridos
    const lowerRequired = requiredPermissions.map((p) => p.toLowerCase());

    const hasPermission = lowerRequired.some((required) =>
      access.permissions.includes(required),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `No tienes permisos. Se requiere uno de: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
