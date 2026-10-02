import { Inject, Injectable, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  PERMISSION_CACHE_TTL,
  permissionKey,
  roleAccessScope,
} from 'src/common/cache/permission-cache';
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

    // Optional so unit tests can build the service with repositories only
    @Optional() @Inject(CACHE_MANAGER)
    private readonly cache?: Cache,
  ) {}

  async resolve(userId: string): Promise<UserAccess | null> {
    if (!userId) return null;

    // User and role state are always read fresh; only the role's grant list is cached (M-63)
    const secUser = await this.userSecurityRepository.findOne({
      where: { id: userId },
      relations: ['role'],
    });

    const isSystemUser = !!secUser?.role;
    const repo: Repository<User | UserSecurity> = isSystemUser
      ? this.userSecurityRepository
      : this.userRepository;
    const user = isSystemUser
      ? secUser
      : await this.userRepository.findOne({ where: { id: userId }, relations: ['role'] });

    if (!user?.role) return null;

    const role = user.role;
    const permissions = await this.rolePermissions(role.id, () =>
      repo.findOne({ where: { id: userId }, relations: ROLE_PERMISSION_RELATIONS }),
    );

    const isActive =
      user.status !== false &&
      !user.deletedAt &&
      role.isActive !== false &&
      !role.deletedAt;

    return { userId, isSystemUser, role, isActive, permissions };
  }

  private async rolePermissions(
    roleId: string,
    loadWithGrants: () => Promise<User | UserSecurity | null>,
  ): Promise<string[]> {
    const key = this.cache ? await permissionKey(this.cache, roleAccessScope(roleId)) : null;
    const cached = key ? await this.cache!.get<string[]>(key) : undefined;
    if (cached) return cached;

    const withGrants = await loadWithGrants();
    const permissions = (withGrants?.role?.permissionMenus ?? [])
      .filter(
        (pr) =>
          pr.isActive &&
          pr.menu?.slug &&
          pr.permission?.isActive &&
          pr.permission?.name,
      )
      .map((pr) => `${pr.menu.slug}.${pr.permission.name}`.toLowerCase());

    if (key) await this.cache!.set(key, permissions, PERMISSION_CACHE_TTL);
    return permissions;
  }

  /** `true` si el usuario está activo y tiene el permiso indicado (`slug.accion`). */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const access = await this.resolve(userId);
    return (
      !!access?.isActive && access.permissions.includes(permission.toLowerCase())
    );
  }
}
