import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import { User } from 'src/user/entities/user.entity';
import { Repository } from 'typeorm';
import { PERMISSIONS_KEY } from '../decorators/permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,

    @InjectRepository(UserSecurity, DatabaseConnectionName.DB_MAIN)
    private readonly userSecurityRepository: Repository<UserSecurity>,

    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,
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

    // 3️⃣ Intentar cargar como UserSecurity primero, luego como User
    let userPermissionCodes: string[] = [];

    const secUser = await this.userSecurityRepository.findOne({
      where: { id: authUser.id },
      relations: [
        'role',
        'role.permissionMenus',
        'role.permissionMenus.permission',
        'role.permissionMenus.menu',
      ],
    });

    if (secUser?.role) {
      const rolePermissions = secUser.role.permissionMenus ?? [];
      userPermissionCodes = rolePermissions
        .filter(
          (pr) =>
            pr.isActive &&
            pr.menu?.name &&
            pr.permission?.isActive &&
            pr.permission?.name,
        )
        .map((pr) => `${pr.menu.name}.${pr.permission.name}`.toLowerCase());

      // Inyectar permisos y rol en la request para uso posterior
      (request as any).userPermissions = userPermissionCodes;
      (request as any).userRole = secUser.role;
    } else {
      // Buscar en tabla de usuarios normales
      const normalUser = await this.userRepository.findOne({
        where: { id: authUser.id },
        relations: [
          'role',
          'role.permissionMenus',
          'role.permissionMenus.permission',
          'role.permissionMenus.menu',
        ],
      });

      if (!normalUser?.role) {
        throw new ForbiddenException(
          'No posee permisos suficientes para el módulo',
        );
      }

      const rolePermissions = normalUser.role.permissionMenus ?? [];
      userPermissionCodes = rolePermissions
        .filter(
          (pr) =>
            pr.isActive &&
            pr.menu?.name &&
            pr.permission?.isActive &&
            pr.permission?.name,
        )
        .map((pr) => `${pr.menu.name}.${pr.permission.name}`.toLowerCase());

      (request as any).userPermissions = userPermissionCodes;
      (request as any).userRole = normalUser.role;
    }

    // 4️⃣ Validar que el usuario tenga al menos uno de los permisos requeridos
    const lowerRequired = requiredPermissions.map((p) => p.toLowerCase());

    const hasPermission = lowerRequired.some((required) =>
      userPermissionCodes.includes(required),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `No tienes permisos. Se requiere uno de: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
