import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Menu } from 'src/menu/entities/menu.entity';
import { Permission } from 'src/permission/entities/permission.entity';
import { Role } from 'src/role/entities/role.entity';
import { In, Repository } from 'typeorm';
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
  async getUserPermissionsSummary(
    userId: string | number,
  ): Promise<PermissionToFront> {
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
    userId: number | string,
  ): Promise<UserPermissionsResponseDto> {
    const user = await this.userRepo.findOne({
      where: { id: String(userId) },
      relations: ['role'],
    });

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
    userId: string | number,
    roleRawId?: string | number,
  ): Promise<MenuTree[]> {
    // Obtener usuario y su rol
    const user = await this.userRepo.findOne({
      where: { id: String(userId) },
      relations: ['role', 'role.permissionMenus'],
    });
    if (!user || !user.roleId)
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);

    const roleId = roleRawId ?? user.roleId;

    const role = await this.roleRepo.findOne({
      where: { id: String(roleId) },
    });

    if (!role) {
      throw new NotFoundException(`Rol no encontrado`);
    }

    // Menús por rol (PermissionRole)
    const roleMenus = await this.permissionMenuRepo.find({
      where: { roleId: String(roleId), isActive: true },
      relations: ['menu'],
    });
    const roleMenuIds = new Set(roleMenus.map((pr) => pr.menuId));

    // Menús por usuario directo (PermissionMenu)
    const userMenus = await this.permissionMenuRepo.find({
      where: { roleId: String(roleId), isActive: true },
      relations: ['menu'],
    });

    const userMenuIds = new Set([
      ...userMenus.map((pm) => pm.menuId),
      ...userMenus.map((pm) => pm.menuId),
    ]);

    // Unir todos los IDs de menú
    const allMenuIds = Array.from(
      new Set([...roleMenuIds, ...userMenuIds]),
    ).filter((id) => !!id);

    if (allMenuIds.length === 0) return [];

    // Buscar los menús activos
    const menus = await this.menuRepo.find({
      where: { id: In(allMenuIds), isActive: true },
      select: ['id', 'slug', 'name', 'parentId', 'url', 'icon', 'order'],
      order: { order: 'ASC' },
    });

    // Crear un mapa para acceso rápido a los menús
    const menuMap = new Map<string, Menu>();
    menus.forEach((menu) => menuMap.set(menu.id, menu));

    // Función recursiva para construir el árbol
    const buildMenuTree = (menuId: string | number): MenuTree => {
      const menu = menuMap.get(String(menuId));
      if (!menu) {
        // Esto no debería ocurrir si la función se llama correctamente
        throw new Error(`Menú con ID ${menuId} no encontrado`);
      }

      // Buscar hijos de este menú que estén en nuestra lista de menús permitidos
      const children = menus
        .filter((m) => m.parentId === String(menuId))
        .map((child) => buildMenuTree(child.id));

      return {
        id: menu.id,
        slug: menu.slug as string,
        name: menu.name,
        url: menu.url,
        icon: menu.icon,
        order: menu.order,
        submenu: children,
      };
    };

    // Obtener solo los menús raíz (sin padre o con padre no incluido en los permisos)
    const rootMenus = menus
      .filter((menu) => {
        // Si no tiene padre, es raíz
        if (!menu.parentId) return true;

        // Si tiene padre, pero el padre no está en nuestros menús permitidos, también es raíz
        const parentExists = menuMap.has(menu.parentId);
        return !parentExists;
      })
      .map((menu) => buildMenuTree(menu.id))
      .filter((menu) => menu.slug != null); // Filtramos los que no tienen slug

    return rootMenus;
  }
}
