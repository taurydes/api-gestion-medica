import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Menu } from 'src/menu/entities/menu.entity';
import { Permission } from 'src/permission/entities/permission.entity';
import { Role } from 'src/role/entities/role.entity';
import { In, IsNull, Repository } from 'typeorm';
import {
  AbilityFactoryResult,
  CaslAction,
  CaslModule,
  CaslUser,
  DbPermission,
  PermissionCheckResult,
  toPermissionCode,
  MenuTree,
  PermissionMatrix,
  ModulePermissions,
  PermissionToFront,
} from '../casl.types';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import {
  AbilityRulesResponseDto,
  AssignPermissionDto,
  BulkAssignMultipleModulesPermissionsToRoleByIdDto,
  BulkAssignMultipleModulesPermissionsToUserByIdDto,
  BulkAssignPermissionsToRoleByIdDto,
  BulkUpdatePermissionsDto,
  CheckPermissionDto,
  PermissionRuleDto,
  RevokePermissionDto,
  UserPermissionsResponseDto,
  UserRoleInfoDto,
} from '../dto';
import { PermissionMenu } from '../entities/permission-menu.entity';
import { AuthUser } from 'src/auth/interfaces/User';
import { User } from 'src/user/entities/user.entity';
import { QueryPermissionDto } from '../dto/query-permission.dto';
import { CreatePermissionDto } from '../dto/create-permission.dto';
import { CreatepermissionsRolesDto } from '../dto/create-permission-role.dto';
import { ModuleItemsMenu } from 'src/menu/menu.const';

type UpdatePermissionDto = Partial<CreatePermissionDto>;
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  // Cache keys
  private readonly USER_ABILITY_KEY = (id: number | string) =>
    `permission:user:${id}:ability`;
  private readonly ROLE_PERMISSIONS_KEY = (id: number | string) =>
    `permission:role:${id}:permissions`;
  private readonly ALL_PERMISSIONS_KEY = 'permission:permissions:all';
  private readonly TTL_SECONDS = 3600; // 1 hora

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVATE CACHE HELPERS
  // ──────────────────────────────────────────────────────────────────────────

  private itemKey(id: string | number): string {
    return `permission:item:${id}`;
  }

  private async cacheGet<T>(key: string): Promise<T | null> {
    return (await this.cache.get<T>(key)) ?? null;
  }

  private async cacheSet<T>(key: string, value: T, ttl = this.TTL_SECONDS): Promise<void> {
    await this.cache.set(key, value, ttl);
  }

  private async invalidateListAndItems(ids: (string | number)[] = []): Promise<void> {
    await this.cache.del(this.ALL_PERMISSIONS_KEY);
    for (const id of ids) {
      await this.cache.del(this.itemKey(id));
    }
  }

  constructor(
    @InjectRepository(UserSecurity, DatabaseConnectionName.DB_MAIN)
    private readonly userRepo: Repository<UserSecurity>,

    @InjectRepository(Role, DatabaseConnectionName.DB_MAIN)
    private readonly roleRepo: Repository<Role>,

    @InjectRepository(Permission, DatabaseConnectionName.DB_MAIN)
    private readonly permissionRepo: Repository<Permission>,

    @InjectRepository(Menu, DatabaseConnectionName.DB_MAIN)
    private readonly menuRepo: Repository<Menu>,

    @InjectRepository(PermissionMenu, DatabaseConnectionName.DB_MAIN)
    private readonly permissionMenuRepo: Repository<PermissionMenu>,

    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly normalUserRepo: Repository<User>,

    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  private normalizeAction(action: string): string {
    return (action || '').trim().toLowerCase();
  }

  // ===========================================================================
  // PUBLIC METHODS - ABILITY MANAGEMENT
  // ===========================================================================

  /**
   * Obtiene las abilities de un usuario (con cache).
   */
  async getAbilityForUser(
    userId: string | number,
  ): Promise<AbilityFactoryResult> {
    const cacheKey = this.USER_ABILITY_KEY(String(userId));

    // Intentar obtener de cache
    let permissions = await this.cache.get<string[]>(cacheKey);

    const user = await this.userRepo.findOne({
      where: { id: String(userId) },
      relations: ['role'],
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    if (!permissions) {
      const rolePermissions = await this.getRolePermissions(user.roleId);
      permissions = rolePermissions.map(toPermissionCode);

      // Guardar en cache
      await this.cache.set(cacheKey, permissions, this.TTL_SECONDS);
    }

    const caslUser: CaslUser = {
      id: user.id,
      roleId: user.roleId,
      roleName: user.role?.name,
      permissions,
    };

    return {
      ability: {
        can: (action: string, subject: string) => {
          if (permissions && permissions.includes('all.manage')) return true;
          return permissions
            ? permissions.includes(`${subject}.${action}`.toLowerCase())
            : false;
        },
        rules: permissions
          ? permissions.map((p) => {
              const [subject, action] = p.split('.');
              return { action, subject, inverted: false };
            })
          : [],
      },
      user: caslUser,
      isAdmin: String(user.roleId) === '1' || String(user.roleId) === '48', // Comparación flexible
      isSuperAdmin: String(user.roleId) === '1',
    };
  }

  /**
   * Verifica si un usuario tiene un permiso específico.
   */
  async checkPermission(
    dto: CheckPermissionDto,
  ): Promise<PermissionCheckResult> {
    try {
      const userId = dto.userId;
      if (!userId) {
        return {
          allowed: false,
          reason: 'userId es requerido para verificar permisos en el servicio',
        };
      }

      const { ability, user } = await this.getAbilityForUser(userId);

      const allowed = ability.can(
        dto.action as CaslAction,
        dto.module as CaslModule,
      );

      return {
        allowed,
        user,
        reason: allowed
          ? undefined
          : `Usuario no tiene permiso ${dto.module}.${dto.action}`,
      };
    } catch (error) {
      this.logger.error(`Error checking permission: ${error.message}`);
      return {
        allowed: false,
        reason: error.message,
      };
    }
  }

  /**
   * Verifica múltiples permisos a la vez.
   */
  async checkPermissions(
    userId: string | number,
    permissions: { module: string; action: string }[],
  ): Promise<Map<string, boolean>> {
    const { ability } = await this.getAbilityForUser(userId);

    const results = new Map<string, boolean>();

    for (const { module, action } of permissions) {
      const key = `${module}.${action}`;
      results.set(key, ability.can(action as CaslAction, module as CaslModule));
    }

    return results;
  }

  // ===========================================================================
  // PUBLIC METHODS - PERMISSION CATALOG (crear acciones dinámicas)
  // ===========================================================================

  /**
   * Crea (si no existe) un permiso/acción en `seguridad.permisos`.
   * Esto habilita acciones dinámicas tipo "aprobar", "rechazar", etc.
   *
   * IMPORTANTE:
   * - Este método NO asigna el permiso a ningún rol.
   * - Luego debes usar `assignPermissionToRole()`.
   */
  async ensurePermissionAction(input: {
    name: string;
    displayName: string;
    userId: string | number;
    order?: number;
    isRequired?: boolean;
    controlType?: string;
  }): Promise<Permission> {
    const name = this.normalizeAction(input.name);

    const existing = await this.permissionRepo.findOne({ where: { name } });
    if (existing) {
      // Si existe, opcionalmente actualizamos displayName/order si vienen
      let dirty = false;
      if (input.displayName && existing.displayName !== input.displayName) {
        existing.displayName = input.displayName;
        dirty = true;
      }
      if (typeof input.order === 'number' && existing.order !== input.order) {
        existing.order = input.order;
        dirty = true;
      }
      if (
        typeof input.isRequired === 'boolean' &&
        existing.isRequired !== input.isRequired
      ) {
        existing.isRequired = input.isRequired;
        dirty = true;
      }
      if (
        typeof input.controlType === 'string' &&
        existing.controlType !== input.controlType
      ) {
        existing.controlType = input.controlType;
        dirty = true;
      }

      if (dirty) {
        existing.updatedAt = new Date();
        await this.permissionRepo.save(existing);
        await this.invalidateAllCache();
      }

      return existing;
    }

    const created = this.permissionRepo.create({
      name,
      displayName: input.displayName,
      userId: String(input.userId),
      isActive: true,
      createdAt: new Date(),
      updatedAt: null,
      deletedAt: null,
      order: typeof input.order === 'number' ? input.order : null,
      isRequired: input.isRequired ?? false,
      controlType: input.controlType ?? null,
    });

    const saved = await this.permissionRepo.save(created);
    await this.invalidateAllCache();

    this.logger.log(
      `Acción de permiso creada: ${saved.name} (${saved.displayName})`,
    );
    return saved;
  }

  /**
   * Activar/Desactivar un permiso (acción) existente.
   */
  async setPermissionActionStatus(
    permissionId: string | number,
    isActive: boolean,
  ): Promise<Permission> {
    const permission = await this.permissionRepo.findOne({
      where: { id: String(permissionId) },
    });
    if (!permission) {
      throw new NotFoundException(
        `Permiso con ID ${permissionId} no encontrado`,
      );
    }

    permission.isActive = isActive;
    permission.updatedAt = new Date();
    permission.deletedAt = isActive ? null : new Date();

    const saved = await this.permissionRepo.save(permission);
    await this.invalidateAllCache();

    // Si desactivamos, también desactivamos las asignaciones activas para evitar inconsistencias
    if (!isActive) {
      await this.permissionMenuRepo.update(
        { permissionId: String(permissionId) },
        { isActive: false, updatedAt: new Date(), deletedAt: new Date() },
      );
    }

    return saved;
  }

  // ===========================================================================
  // PUBLIC METHODS - PERMISSION CRUD
  // ===========================================================================

  /**
   * Asigna un permiso a un rol.
   */
  async assignPermissionToRole(
    dto: AssignPermissionDto,
    user: AuthUser,
  ): Promise<PermissionMenu> {
    const { roleId, menuSlug, action, permissionId } = dto;

    const normalizedAction = this.normalizeAction(action);

    // Buscar o validar el rol
    const role = await this.roleRepo.findOne({
      where: { id: String(roleId) },
    });
    if (!role) {
      throw new NotFoundException(`Rol con ID ${roleId} no encontrado`);
    }

    // Buscar el menú por slug
    const menu = await this.menuRepo.findOne({ where: { slug: menuSlug } });
    if (!menu) {
      throw new NotFoundException(`Menú con slug '${menuSlug}' no encontrado`);
    }

    // Buscar el permiso por nombre (acción) o por ID
    let permission: Permission | null = null;
    if (permissionId) {
      permission = await this.permissionRepo.findOne({
        where: { id: String(permissionId) },
      });
    } else {
      permission = await this.permissionRepo.findOne({
        where: { name: normalizedAction },
      });
    }

    if (!permission) {
      throw new NotFoundException(
        `Permiso '${normalizedAction}' no encontrado. Debes crearlo primero (createPermissionAction).`,
      );
    }

    // Verificar si ya existe la asignación
    const existing = await this.permissionMenuRepo.findOne({
      where: {
        roleId: String(roleId),
        menuId: String(menu.id),
        permissionId: String(permission.id),
      },
    });

    if (existing) {
      // Si existe pero está inactivo, reactivarlo
      if (!existing.isActive) {
        existing.isActive = true;
        existing.updatedAt = new Date();
        await this.permissionMenuRepo.save({ ...existing, userId: user.id });
        await this.invalidateRoleCache(roleId);
        return existing;
      }
      // Ya existe y está activo
      return existing;
    }

    // Crear nueva asignación
    const newPermissionRole = this.permissionMenuRepo.create({
      roleId: String(roleId),
      menuId: String(menu.id),
      permissionId: String(permission.id),
      isActive: true,
      userId: String(user.id),
    });

    const saved = await this.permissionMenuRepo.save(newPermissionRole);

    // Invalidar cache
    await this.invalidateRoleCache(roleId);

    this.logger.log(`Permiso ${menuSlug}.${action} asignado al rol ${roleId}`);
    return saved;
  }

  /**
   * Revoca un permiso de un rol.
   */
  async revokePermissionFromRole(dto: RevokePermissionDto): Promise<boolean> {
    const { roleId, menuSlug, action } = dto;

    const normalizedAction = this.normalizeAction(action);

    // Buscar el menú
    const menu = await this.menuRepo.findOne({ where: { slug: menuSlug } });
    if (!menu) {
      return false;
    }

    // Buscar el permiso
    const permission = await this.permissionRepo.findOne({
      where: { name: normalizedAction },
    });
    if (!permission) {
      return false;
    }

    // Buscar la asignación
    const existing = await this.permissionMenuRepo.findOne({
      where: {
        roleId: String(roleId),
        menuId: String(menu.id),
        permissionId: String(permission.id),
      },
    });

    if (!existing) {
      return false;
    }

    // Soft delete (desactivar)
    existing.isActive = false;
    existing.updatedAt = new Date();
    existing.deletedAt = new Date();
    await this.permissionMenuRepo.save(existing);

    // Invalidar cache
    await this.invalidateRoleCache(roleId);

    this.logger.log(`Permiso ${menuSlug}.${action} revocado del rol ${roleId}`);
    return true;
  }

  /**
   * Actualiza múltiples permisos de un rol a la vez.
   */
  async bulkUpdateRolePermissions(
    dto: BulkUpdatePermissionsDto,
    user: AuthUser,
  ): Promise<void> {
    const { roleId, permissions } = dto;
    for (const { module, action, enabled } of permissions) {
      if (enabled) {
        await this.assignPermissionToRole(
          {
            roleId,
            menuSlug: module,
            action,
          },
          user,
        );
      } else {
        await this.revokePermissionFromRole({
          roleId,
          menuSlug: module,
          action,
        });
      }
    }

    await this.invalidateRoleCache(roleId);
  }

  // ===========================================================================
  // PUBLIC METHODS - PERMISSION QUERIES
  // ===========================================================================

  /**
   * Obtiene todos los permisos de un rol.
   */
  async getRolePermissions(roleId: number | string): Promise<DbPermission[]> {
    const cacheKey = this.ROLE_PERMISSIONS_KEY(
      typeof roleId === 'number' ? roleId : 0,
    );

    const cached = await this.cache.get<DbPermission[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const permissionRoles = await this.permissionMenuRepo.find({
      where: { roleId: String(roleId), isActive: true },
      relations: ['permission', 'menu'],
    });

    const permissions: DbPermission[] = permissionRoles
      .filter((pr) => pr.permission?.isActive && pr.menu?.slug)
      .map((pr) => ({
        module: pr.menu.slug!,
        action: pr.permission.name,
        permissionId: pr.permissionId,
        menuId: pr.menuId,
        isActive: true,
      }));

    await this.cache.set(cacheKey, permissions, this.TTL_SECONDS);

    return permissions;
  }

  /**
   * Obtiene los permisos agrupados por módulo para un usuario (para frontend).
   * Optimizado: no trae todos los menús ni todos los permisos, solo los que el usuario posee.
   */
  async getUserPermissionsSummary(userId: string): Promise<PermissionToFront> {
    // Construye la habilidad y (en result.user.permissions) vienen los permisos planos tipo "module.action"
    const data = await this.getUserPermissions(userId);
    return {
      role: data.role,
      permissions: data.permissions,
      menus: data.menus,
    };
  }

  /**
   * Obtiene los módulos/acciones disponibles en el sistema.
   */
  async getAvailablePermissions(): Promise<{
    modules: { slug: string; name: string }[];
    actions: { name: string; displayName: string }[];
  }> {
    const menus = await this.menuRepo.find({
      where: { isActive: true },
      select: ['slug', 'name'],
      order: { order: 'ASC' },
    });

    const permissions = await this.permissionRepo.find({
      where: { isActive: true },
      select: ['name', 'displayName'],
      order: { order: 'ASC' },
    });

    return {
      modules: menus
        .filter((m) => m.slug)
        .map((m) => ({ slug: m.slug!, name: m.name })),
      actions: permissions.map((p) => ({
        name: p.name,
        displayName: p.displayName,
      })),
    };
  }

  // ===========================================================================
  // GO-STYLE API METHODS
  // ===========================================================================

  /**
   * Obtiene permisos de usuario en formato estilo Go.
   * Compatible con la estructura de respuesta de la API de Go.
   */
  async getUserPermissions(
    userId: string,
  ): Promise<UserPermissionsResponseDto> {
    let user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['role'],
    });

    if (!user) {
      user = (await this.normalUserRepo.findOne({
        where: { id: userId },
        relations: ['role'],
      })) as any;
    }

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    if (!user.roleId) {
      throw new NotFoundException(
        `Rol de usuario con ID ${userId} no encontrado`,
      );
    }
    const rolePermissions = await this.getRolePermissions(user.roleId);
    const menus = await this.getMenusForUserAndRole(userId);

    // Construir reglas CASL
    const rules: PermissionRuleDto[] = rolePermissions.map((p) => ({
      action: p.action,
      subject: p.module,
      fields: undefined,
      conditions: undefined,
      inverted: false,
      reason: undefined,
    }));

    // Lista plana de permisos
    const permissions = rolePermissions.map((p) => `${p.module}.${p.action}`);

    return {
      userId: user.id,
      email: user.email,
      role: {
        id: user.role.id,
        name: user.role.name,
      },
      rules,
      menus,
      permissions,
      timestamp: new Date(),
    };
  }

  /**
   * Invalida el cache de un rol específico.
   */
  async invalidateRoleCache(roleId: number | string): Promise<void> {
    await this.cache.del(this.ROLE_PERMISSIONS_KEY(roleId));

    // También invalidar cache de usuarios con ese rol
    const users = await this.userRepo.find({
      where: { roleId: String(roleId) },
      select: ['id'],
    });

    for (const user of users) {
      await this.cache.del(this.USER_ABILITY_KEY(user.id));
    }

    this.logger.debug(
      `Cache invalidado para rol ${roleId} y ${users.length} usuarios`,
    );
  }

  /**
   * Invalida el cache de un usuario específico.
   */
  async invalidateUserCache(userId: number | string): Promise<void> {
    await this.cache.del(this.USER_ABILITY_KEY(userId));
  }

  /**
   * Invalida todo el cache de permisos.
   */
  async invalidateAllCache(): Promise<void> {
    await this.cache.del(this.ALL_PERMISSIONS_KEY);
    // Nota: Para invalidar todos los usuarios/roles necesitarías un patrón
    // de cache más sofisticado o usar Redis SCAN
    this.logger.warn('Cache general de permisos invalidado');
  }

  /**
   * Obtiene reglas CASL para el frontend (formato @casl/ability).
   * Útil para inicializar Ability en el cliente.
   */
  async getAbilityRules(
    userId: number | string,
  ): Promise<AbilityRulesResponseDto> {
    const { ability, user } = await this.getAbilityForUser(userId);

    // Extraer reglas del ability
    const rules = (ability.rules || []).map((rule) => ({
      action: Array.isArray(rule.action) ? rule.action[0] : rule.action,
      subject: Array.isArray(rule.subject) ? rule.subject[0] : rule.subject,
      fields: rule.fields,
      conditions: rule.conditions,
      inverted: rule.inverted ?? false,
      reason: rule.reason,
    }));

    return {
      rules,
      detectSubjectType: false,
    };
  }

  // ===========================================================================
  // BULK ASSIGN PERMISSIONS (SOLO POR IDs)
  // ===========================================================================

  /**
   * Asigna múltiples permisos (acciones) de un módulo a un rol.
   * @param roleId ID del rol
   * @param moduleId ID del módulo (menú)
   * @param permissionIds Lista de IDs de permisos
   */
  async bulkAssignPermissionsToRoleById(
    dto: BulkAssignPermissionsToRoleByIdDto,
    currentUser: AuthUser,
  ): Promise<{ success: boolean; assignedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let assignedCount = 0;
    const { roleId, moduleId, permissionIds } = dto;
    // Validar rol
    const role = await this.roleRepo.findOne({
      where: { id: String(roleId) },
    });
    if (!role) {
      throw new NotFoundException(`Rol con ID ${roleId} no encontrado`);
    }

    // Validar módulo
    const menu = await this.menuRepo.findOne({
      where: { id: String(moduleId) },
    });
    if (!menu) {
      throw new NotFoundException(`Módulo con ID '${moduleId}' no encontrado`);
    }

    for (const permissionId of permissionIds) {
      try {
        // Buscar el permiso
        const permission = await this.permissionRepo.findOne({
          where: { id: String(permissionId) },
        });
        if (!permission) {
          errors.push(
            `Permiso con ID '${permissionId}' no encontrado en el catálogo`,
          );
          continue;
        }
        // Verificar si ya existe la asignación
        const existing = await this.permissionMenuRepo.findOne({
          where: {
            roleId: String(roleId),
            menuId: String(menu.id),
            permissionId: String(permission.id),
          },
        });
        if (existing) {
          if (!existing.isActive) {
            existing.isActive = true;
            existing.updatedAt = new Date();
            existing.deletedAt = null;
            await this.permissionMenuRepo.save(existing);
            assignedCount++;
          }
          continue;
        }
        // Crear nueva asignación
        const newPermissionRole = this.permissionMenuRepo.create({
          roleId: String(roleId),
          menuId: String(menu.id),
          permissionId: String(permission.id),
          isActive: true,
          createdAt: new Date(),
          userId: String(currentUser.id),
        });
        await this.permissionMenuRepo.save(newPermissionRole);
        assignedCount++;
      } catch (error) {
        errors.push(
          `Error asignando permiso ID '${permissionId}': ${error.message}`,
        );
      }
    }
    await this.invalidateRoleCache(roleId);
    this.logger.log(
      `Asignados ${assignedCount} permisos (por ID) al rol ${roleId} para módulo ${moduleId}`,
    );
    return { success: errors.length === 0, assignedCount, errors };
  }

  /**
   * Asigna múltiples permisos de múltiples módulos a un rol (por IDs).
   * @param roleId ID del rol
   * @param permissions Lista de {moduleId, permissionId, enabled}
   */
  async bulkAssignMultipleModulesPermissionsToRoleById(
    dto: BulkAssignMultipleModulesPermissionsToRoleByIdDto,
    currentUser: AuthUser,
  ): Promise<{
    success: boolean;
    assignedCount: number;
    revokedCount: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let assignedCount = 0;
    let revokedCount = 0;
    const { roleId, permissions } = dto;
    const role = await this.roleRepo.findOne({
      where: { id: String(roleId) },
    });
    if (!role) {
      throw new NotFoundException(`Rol con ID ${roleId} no encontrado`);
    }

    for (const perm of permissions) {
      try {
        const enabled = perm.enabled !== false;

        // Validar módulo y permiso
        const menu = await this.menuRepo.findOne({
          where: { id: String(perm.moduleId) },
        });
        if (!menu) {
          errors.push(`Módulo con ID '${perm.moduleId}' no encontrado`);
          continue;
        }
        const permission = await this.permissionRepo.findOne({
          where: { id: String(perm.permissionId) },
        });
        if (!permission) {
          errors.push(`Permiso con ID '${perm.permissionId}' no encontrado`);
          continue;
        }

        const existing = await this.permissionMenuRepo.findOne({
          where: {
            roleId: String(roleId),
            menuId: String(menu.id),
            permissionId: String(permission.id),
          },
        });

        if (enabled) {
          if (existing) {
            if (!existing.isActive) {
              existing.isActive = true;
              existing.updatedAt = new Date();
              existing.deletedAt = null;
              await this.permissionMenuRepo.save({
                ...existing,
                userId: currentUser.id,
              });
              assignedCount++;
            }
            continue;
          }

          const created = this.permissionMenuRepo.create({
            roleId: String(roleId),
            menuId: String(menu.id),
            permissionId: String(permission.id),
            isActive: true,
            createdAt: new Date(),
            userId: String(currentUser.id),
          });
          await this.permissionMenuRepo.save(created);
          assignedCount++;
        } else {
          if (!existing || !existing.isActive) continue;
          existing.isActive = false;
          existing.updatedAt = new Date();
          existing.deletedAt = new Date();
          await this.permissionMenuRepo.save(existing);
          revokedCount++;
        }
      } catch (error) {
        errors.push(
          `Error en '${perm.moduleId}.${perm.permissionId}': ${error.message}`,
        );
      }
    }

    await this.invalidateRoleCache(roleId);

    return {
      success: errors.length === 0,
      assignedCount,
      revokedCount,
      errors,
    };
  }

  /**
   * Asigna múltiples permisos de múltiples módulos a un usuario (por IDs) directamente.
   * @param userId ID del usuario
   * @param permissions Lista de {moduleId, permissionId}
   */
  async bulkAssignMultipleModulesPermissionsToUserById(
    dto: BulkAssignMultipleModulesPermissionsToUserByIdDto,
  ): Promise<{ success: boolean; assignedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let assignedCount = 0;
    const { userId, permissions } = dto;
    const user = await this.userRepo.findOne({ where: { id: String(userId) } });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    // Agrupar por módulo para reutilizar bulkAssignPermissionsToUserById
    const byModule = new Map<string | number, (string | number)[]>();
    for (const perm of permissions) {
      const list = byModule.get(perm.moduleId) || [];
      list.push(perm.permissionId);
      byModule.set(perm.moduleId, list);
    }

    for (const [moduleId, permissionIds] of byModule) {
      const result = await this.bulkAssignPermissionsToUserById(
        userId,
        moduleId,
        permissionIds,
      );
      assignedCount += result.assignedCount;
      errors.push(...result.errors);
    }

    return { success: errors.length === 0, assignedCount, errors };
  }

  /**
   * Asigna múltiples permisos (acciones) de un módulo a un usuario usando IDs.
   * @param userId ID del usuario
   * @param moduleId ID del módulo (menú)
   * @param permissionIds Lista de IDs de permisos
   */
  async bulkAssignPermissionsToUserById(
    userId: string | number,
    moduleId: string | number,
    permissionIds: (string | number)[],
  ): Promise<{ success: boolean; assignedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let assignedCount = 0;

    const user = await this.userRepo.findOne({ where: { id: String(userId) } });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const menu = await this.menuRepo.findOne({
      where: { id: String(moduleId) },
    });
    if (!menu) {
      throw new NotFoundException(`Módulo con ID '${moduleId}' no encontrado`);
    }

    for (const permissionId of permissionIds) {
      try {
        const permission = await this.permissionRepo.findOne({
          where: { id: String(permissionId) },
        });
        if (!permission) {
          errors.push(
            `Permiso con ID '${permissionId}' no encontrado en el catálogo`,
          );
          continue;
        }

        const existing = await this.permissionMenuRepo.findOne({
          where: {
            userId: String(userId),
            menuId: String(menu.id),
            permissionId: String(permission.id),
          },
        });

        if (existing) {
          if (!existing.isActive) {
            existing.isActive = true;
            existing.updatedAt = new Date();
            existing.deletedAt = null;
            await this.permissionMenuRepo.save(existing);
            assignedCount++;
          }
          continue;
        }

        const newPermissionMenu = this.permissionMenuRepo.create({
          userId: String(userId),
          menuId: String(menu.id),
          permissionId: String(permission.id),
          roleId: String(user.roleId || ''),
          isActive: true,
          createdAt: new Date(),
        });

        await this.permissionMenuRepo.save(newPermissionMenu);
        assignedCount++;
      } catch (error) {
        errors.push(
          `Error asignando permiso ID '${permissionId}': ${error.message}`,
        );
      }
    }

    await this.invalidateUserCache(userId);

    return { success: errors.length === 0, assignedCount, errors };
  }

  /**
   * Obtiene los menús disponibles para un usuario considerando permisos por rol y por usuario.
   * Estructura recursiva para hijos.
   */
  async getMenusForUserAndRole(
    userId: string,
    roleRawId?: string | number,
  ): Promise<MenuTree[]> {
    // Obtener usuario y su rol (buscando en ambos repos)
    let user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['role'],
    });

    if (!user) {
      user = (await this.normalUserRepo.findOne({
        where: { id: userId },
        relations: ['role'],
      })) as any;
    }

    if (!user || !user.roleId)
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);

    const roleId = roleRawId ?? user.roleId;

    // 1. Obtener IDs de menús permitidos para este rol
    const permissionMenus = await this.permissionMenuRepo.find({
      where: { roleId: String(roleId), isActive: true },
      select: ['menuId'],
    });
    const allowedMenuIds = new Set(permissionMenus.map((pm) => pm.menuId));

    // 2. Cargar TODOS los menús activos y visibles para construir la estructura completa
    const allMenus = await this.menuRepo.find({
      where: { isActive: true, isVisible: true },
      order: { order: 'ASC' },
      select: ['id', 'slug', 'name', 'parentId', 'url', 'icon', 'order'],
    });

    const menuMap = new Map<string, Menu>();
    allMenus.forEach((m) => menuMap.set(m.id, m));

    // 3. Función recursiva para construir el árbol
    const buildMenuTree = (menuId: string): MenuTree | null => {
      const menu = menuMap.get(menuId);
      if (!menu) return null;

      // Buscar hijos de este menú
      const children = allMenus
        .filter((m) => m.parentId === menuId)
        .map((child) => buildMenuTree(child.id))
        .filter((child) => child !== null) as MenuTree[];

      // Un menú se muestra si:
      // a) Él mismo tiene permiso directo (allowedMenuIds.has(menuId))
      // b) O alguno de sus hijos tiene permiso (children.length > 0)
      if (!allowedMenuIds.has(menuId) && children.length === 0) {
        return null;
      }

      return {
        id: menu.id,
        slug: menu.slug || '',
        name: menu.name,
        url: menu.url,
        icon: menu.icon,
        order: menu.order,
        submenu: children,
      };
    };

    // 4. Construir el árbol desde los raíces (parentId null o padre no existe/no visible)
    const rootMenus = allMenus
      .filter((m) => !m.parentId || !menuMap.has(m.parentId))
      .map((m) => buildMenuTree(m.id))
      .filter((m) => m !== null) as MenuTree[];

    return rootMenus;
  }

/**
   * Obtiene todos los permisos registrados en la base de datos.
   *
   * @returns Un arreglo de objetos Permission.
   * @throws InternalServerErrorException Si ocurre un error durante la consulta.
   *
   * ⚡ Cache: guarda/lee en `permission:permissions:all`
   */
  async findAll(pagination: QueryPermissionDto): Promise<Permission[]> {
    try {
      const cacheKey = this.ALL_PERMISSIONS_KEY;
      const cached = await this.cacheGet<Permission[]>(cacheKey);
      if (cached) return cached;


      const query = this.permissionRepo.createQueryBuilder('permission');

      if (pagination.search) {
        query.where('permission.name ILIKE :search', {
          search: `%${pagination.search}%`,
        });
      }
      if (pagination.isActive !== undefined) {
        query.andWhere('permission.isActive = :isActive', {
          isActive: pagination.isActive,
        });
      }
      query.orderBy('permission.createdAt', 'DESC');

      const permissions = await query.getMany();
       


      await this.cacheSet(cacheKey, permissions);
      return permissions;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException('Error al obtener los permisos');
    }
  }


  ////LEGACY 
  /**
   * Busca un permiso específico por su ID.
   *
   * @param id - Identificador único del permiso.
   * @returns El permiso encontrado.
   * @throws NotFoundException Si no existe el permiso con el ID indicado.
   * @throws InternalServerErrorException Si ocurre un error inesperado en la consulta.
   *
   * ⚡ Cache: guarda/lee en `permissions:{id}`
   */
  async findOne(id: string): Promise<Permission> {
    try {
      const key = this.itemKey(id);
      const cached = await this.cacheGet<Permission>(key);
      if (cached) return cached;

      const permission = await this.permissionRepo.findOne({ where: { id } });
      if (!permission) {
        throw new NotFoundException(`Permiso con ID ${id} no encontrado`);
      }

      await this.cacheSet(key, permission);
      return permission;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al obtener el permiso');
    }
  }

  /**
   * Actualiza la información de un permiso existente.
   *
   * @param id - Identificador del permiso a actualizar.
   * @param updatePermissionDto - Datos a modificar.
   * @returns El permiso actualizado.
   * @throws NotFoundException Si el permiso no existe.
   * @throws InternalServerErrorException Si ocurre un error al guardar los cambios.
   *
   * 🧼 Cache: invalida item + lista, y precarga el item actualizado.
   */
  async update(
    id: string,
    updatePermissionDto: UpdatePermissionDto,
  ): Promise<Permission> {
    try {
      const permission = await this.findOne(id);
      Object.assign(permission, updatePermissionDto, { updatedAt: new Date() });

      const saved = await this.permissionRepo.save(permission);

      // Invalida lista y precachea el item actualizado
      await this.invalidateListAndItems([id]);
      await this.cacheSet(this.itemKey(id), saved);

      return saved;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al actualizar el permiso');
    }
  }

  /**
   * Elimina un permiso de la base de datos.
   *
   * @param id - Identificador del permiso a eliminar.
   * @returns void
   * @throws NotFoundException Si el permiso no existe.
   * @throws InternalServerErrorException Si ocurre un error durante la eliminación.
   *
   * 🧼 Cache: invalida item + lista
   */
  async remove(id: string): Promise<void> {
    try {
      const permission = await this.findOne(id);
      // Soft delete: marcar como inactivo en vez de borrar físicamente
      permission.isActive = false;
      permission.deletedAt = new Date();
      await this.permissionRepo.save(permission);

      await this.invalidateListAndItems([id]);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al eliminar el permiso');
    }
  }

  /**
   * Asigna uno o varios permisos a un rol (estrategia replace-all).
   * - Crea registros nuevos que no existan.
   * - Reactiva los que estaban inactivos.
   * - Desactiva los que ya no están en la nueva lista.
   */
  async assignPermissionsToRole(
    dto: CreatepermissionsRolesDto,
    currentUser: AuthUser,
  ): Promise<{ created: number; skipped: number; deactivated: number }> {
    const { roleId, assignments } = dto;

    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Rol con ID ${roleId} no existe`);

    // Registros activos actuales del rol
    const existing = await this.permissionMenuRepo.find({
      where: { roleId, isActive: true },
    });

    const incomingKeys = new Set(
      assignments.map(({ permissionId, submenuId }) => `${permissionId}:${submenuId}`),
    );
    const existingActiveMap = new Map(
      existing.map((e) => [`${e.permissionId}:${e.menuId}`, e]),
    );

    let created = 0;
    let skipped = 0;

    for (const { permissionId, submenuId } of assignments) {
      const key = `${permissionId}:${submenuId}`;
      if (existingActiveMap.has(key)) {
        skipped++;
        continue;
      }

      // Intentar reactivar si existe pero inactivo
      const inactive = await this.permissionMenuRepo.findOne({
        where: { roleId, permissionId, menuId: submenuId, isActive: false },
      });
      if (inactive) {
        inactive.isActive = true;
        inactive.updatedAt = new Date();
        inactive.deletedAt = null;
        await this.permissionMenuRepo.save(inactive);
        created++;
        continue;
      }

      const newRecord = this.permissionMenuRepo.create({
        roleId,
        permissionId,
        menuId: submenuId,
        isActive: true,
        userId: String(currentUser.id),
      });
      await this.permissionMenuRepo.save(newRecord);
      created++;
    }

    // Desactivar los que ya no están en la nueva lista
    let deactivated = 0;
    for (const record of existing) {
      const key = `${record.permissionId}:${record.menuId}`;
      if (!incomingKeys.has(key)) {
        record.isActive = false;
        record.updatedAt = new Date();
        record.deletedAt = new Date();
        await this.permissionMenuRepo.save(record);
        deactivated++;
      }
    }

    await this.invalidateRoleCache(roleId);
    this.logger.log(
      `assignPermissionsToRole: rol=${roleId} created=${created} skipped=${skipped} deactivated=${deactivated}`,
    );
    return { created, skipped, deactivated };
  }

  /**
   * Asigna TODOS los permisos activos a un rol para TODOS los menús activos.
   * Solo crea/reactiva los que faltan; no toca los que ya existen.
   */
  async assignAllPermissionsToRole(
    roleId: string,
    currentUser: AuthUser,
  ): Promise<{ roleId: string; created: number; skipped: number }> {
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Rol con ID ${roleId} no existe`);

    const [permissions, menus] = await Promise.all([
      this.permissionRepo.find({ where: { isActive: true } }),
      this.menuRepo.find({ where: { isActive: true, deletedAt: IsNull() } }),
    ]);

    if (!permissions.length) throw new NotFoundException('No hay permisos activos');
    if (!menus.length) throw new NotFoundException('No hay menús activos');

    const existingAll = await this.permissionMenuRepo.find({ where: { roleId } });
    const existingActiveKeys = new Set(
      existingAll.filter((e) => e.isActive).map((e) => `${e.permissionId}:${e.menuId}`),
    );
    const inactiveMap = new Map(
      existingAll
        .filter((e) => !e.isActive)
        .map((e) => [`${e.permissionId}:${e.menuId}`, e]),
    );

    let created = 0;
    let skipped = 0;

    const toCreate: PermissionMenu[] = [];
    const toReactivate: PermissionMenu[] = [];

    for (const menu of menus) {
      for (const permission of permissions) {
        const key = `${permission.id}:${menu.id}`;
        if (existingActiveKeys.has(key)) {
          skipped++;
          continue;
        }
        const inactiveRecord = inactiveMap.get(key);
        if (inactiveRecord) {
          inactiveRecord.isActive = true;
          inactiveRecord.updatedAt = new Date();
          inactiveRecord.deletedAt = null;
          toReactivate.push(inactiveRecord);
        } else {
          toCreate.push(
            this.permissionMenuRepo.create({
              roleId,
              permissionId: permission.id,
              menuId: menu.id,
              isActive: true,
              userId: String(currentUser.id),
            }),
          );
        }
      }
    }

    if (toCreate.length) {
      await this.permissionMenuRepo.save(toCreate);
      created += toCreate.length;
    }
    if (toReactivate.length) {
      await this.permissionMenuRepo.save(toReactivate);
      created += toReactivate.length;
    }

    await this.invalidateRoleCache(roleId);
    this.logger.log(`assignAllPermissionsToRole: rol=${roleId} created=${created} skipped=${skipped}`);
    return { roleId, created, skipped };
  }

  // ===========================================================================
  // (bloques comentados legacy eliminados)
}

