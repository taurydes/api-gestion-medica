import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { User } from 'src/user/entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler(),
    );
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // Si no se requieren permisos, permitir acceso
    }

    const request = context.switchToHttp().getRequest<Request>();
    const userRaw: any = request.user;

    if (!userRaw || !userRaw.id) {
      throw new ForbiddenException('Usuario no autenticado');
    }
    // Consultar al usuario con sus relaciones (rol y permisos)
    const user = await this.userRepository.findOne({
      where: { id: userRaw.id },
      relations: [
        'role',
        'role.permissionsRoles',
        'role.permissionsRoles.permission',
      ],
    });

    if (!user) {
      throw new ForbiddenException('Usuario no encontrado');
    }

     // Verificar si el rol del usuario tiene al menos uno de los permisos requeridos
    const hasPermission = user.role.permissionsRoles.some(
      (pr) => requiredPermissions.includes(pr.permission.name) && pr.active,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a este recurso',
      );
    }

    return true;
  }
}
