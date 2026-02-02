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
import { Repository } from 'typeorm';
import { PERMISSIONS_KEY } from '../decorators/permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,

    @InjectRepository(UserSecurity, DatabaseConnectionName.DB_MAIN)
    private readonly userSecurityRepository: Repository<UserSecurity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1️⃣ Leer permisos desde el decorador @Permission()
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

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

    // 3️⃣ Cargar usuario con rol y permisos necesarios
    const user = await this.userSecurityRepository.findOne({
      where: { id: authUser.id },
      relations: [
        'role',
        'role.permissionsRoles',
        'role.permissionsRoles.permission',
        'role.permissionsRoles.submenu',
      ],
    });

    if (!user || !user.role) {
      throw new ForbiddenException('No posee permisos suficientes para el modulo');
    }

    const rolePermissions = user.role.permissionsRoles ?? [];

    // 4️⃣ Construir lista de permisos en formato module.permission
    // ejemplo: usuarios.crear, roles.eliminar, reportes.ver
    const userPermissionCodes = rolePermissions
      .filter(
        (pr) =>
          pr.isActive &&
          pr.submenu?.name &&
          pr.permission?.isActive &&
          pr.permission?.name,
      )
      .map((pr) => `${pr.submenu.name}.${pr.permission.name}`);
    // (opcional: debug)
    // console.log('PERMISOS DEL USUARIO:', userPermissionCodes);
      const lowerrequiredPermissions = requiredPermissions.map(permission => permission.toLowerCase());
      const lowerUserPermissionCodes = userPermissionCodes.map(permission => permission.toLowerCase());
    // 5️⃣ Validar que el usuario tenga al menos uno de los permisos requeridos
    const hasPermission = lowerrequiredPermissions.some((required) =>
      lowerUserPermissionCodes.includes(required),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `No tienes permisos. Se requiere uno de: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
