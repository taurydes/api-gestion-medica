import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Role } from 'src/role/entities/role.entity';
import { User } from 'src/user/entities/user.entity';
import { UserSecurity } from 'src/user/entities/user.system.entity';

/** Permiso que identifica a un administrador con alcance global (sin filtro por médico). */
export const ADMIN_SCOPE_PERMISSION = 'security.consultar';

export interface UserAccess {
  userId: string;
  isSystemUser: boolean;
  role: Role;
  /** Usuario y rol activos y no borrados. */
  isActive: boolean;
  /** Permisos activos en formato `slug.accion`, en minúsculas. */
  permissions: string[];
}

const ROLE_PERMISSION_RELATIONS = [
  'role',
  'role.permissionMenus',
  'role.permissionMenus.permission',
  'role.permissionMenus.menu',
];

/**
 * Resuelve rol, estado y permisos de un usuario desde la BD (seguridad.users primero, luego users).
 * Fuente única para PermissionsGuard, los paneles de administración y la detección de admin.
 */
@Injectable()
export class UserAccessService {
  constructor(
    @InjectRepository(UserSecurity, DatabaseConnectionName.DB_MAIN)
    private readonly userSecurityRepository: Repository<UserSecurity>,

    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,
  ) {}

  async resolve(userId: string): Promise<UserAccess | null> {
    if (!userId) return null;

    const secUser = await this.userSecurityRepository.findOne({
      where: { id: userId },
      relations: ROLE_PERMISSION_RELATIONS,
    });

    const isSystemUser = !!secUser?.role;
    const user: User | UserSecurity | null = isSystemUser
      ? secUser
      : await this.userRepository.findOne({
          where: { id: userId },
          relations: ROLE_PERMISSION_RELATIONS,
        });

    if (!user?.role) return null;

    const role = user.role;
    const permissions = (role.permissionMenus ?? [])
      .filter(
        (pr) =>
          pr.isActive &&
          pr.menu?.slug &&
          pr.permission?.isActive &&
          pr.permission?.name,
      )
      .map((pr) => `${pr.menu.slug}.${pr.permission.name}`.toLowerCase());

    const isActive =
      user.status !== false &&
      !user.deletedAt &&
      role.isActive !== false &&
      !role.deletedAt;

    return { userId, isSystemUser, role, isActive, permissions };
  }

  /** `true` si el usuario está activo y tiene el permiso indicado (`slug.accion`). */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const access = await this.resolve(userId);
    return (
      !!access?.isActive && access.permissions.includes(permission.toLowerCase())
    );
  }
}
