import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Role } from 'src/role/entities/role.entity';
import { In, Repository } from 'typeorm';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { Permission } from './entities/permission.entity';
import { PermissionRole } from './entities/Permission-role.entity';
import { CreatepermissionsRolesDto } from './dto/create-permission-role.dto';
import { MenuService } from '../menu/menu.service';
import { ModuleItemsMenu } from 'src/menu/menu.const';

/**
 * Servicio: PermissionService
 *
 * Gestiona la creación, lectura, actualización y eliminación de permisos,
 * así como la asignación de permisos a roles dentro del sistema.
 *
 * 💾 Además, usa cache Redis (cache-manager) para:
 *   - Cachear listados `findAll()`
 *   - Cachear lecturas por id `findOne(id)`
 *   - Invalidar cache en create/update/remove/assign
 */
@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission, DatabaseConnectionName.DB_MAIN)
    private readonly permissionRepository: Repository<Permission>,

    @InjectRepository(Role, DatabaseConnectionName.DB_MAIN)
    private readonly roleRepository: Repository<Role>,

    @InjectRepository(PermissionRole, DatabaseConnectionName.DB_MAIN)
    private readonly rolePermissionRepository: Repository<PermissionRole>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,

    private readonly menuService: MenuService,
  ) {}

  // -----------------------------
  // 🔒 Helpers de cache
  // -----------------------------
  private readonly LIST_KEY = 'permissions:list';
  private itemKey = (id: string) => `permissions:${id}`;
  private TTL_SECONDS = Number(process.env.CACHE_TTL ?? 3600); // usa tu env o el default del módulo

  private async cacheGet<T>(key: string) {
    return (await this.cache.get<T>(key)) ?? null;
  }
  private async cacheSet<T>(key: string, value: T, ttl = this.TTL_SECONDS) {
    await this.cache.set(key, value, ttl);
  }
  private async cacheDel(key: string) {
    try {
      await this.cache.del(key);
    } catch {
      /* noop */
    }
  }
  private async invalidateListAndItems(ids: string[] = []) {
    await this.cacheDel(this.LIST_KEY);
    await Promise.all(ids.map((id) => this.cacheDel(this.itemKey(id))));
  }

  /**
   * Crea un nuevo permiso en la base de datos.
   *
   * @param createPermissionDto - Datos del permiso a crear.
   * @returns El permiso creado con su información completa.
   * @throws InternalServerErrorException Si ocurre un error al guardar el registro.
   *
   * 🧩 Cache: invalida lista global.
   */
  async create(createPermissionDto: CreatePermissionDto): Promise<Permission> {
    try {
      const permission = this.permissionRepository.create(createPermissionDto);
      const saved = await this.permissionRepository.save(permission);

      // 🧼 Invalida cache de listado
      await this.invalidateListAndItems();

      // (Opcional) precargar cache del item
      await this.cacheSet(this.itemKey(saved.id), saved);

      return saved;
    } catch {
      throw new InternalServerErrorException('Error al crear el permiso');
    }
  }

  /**
   * Obtiene todos los permisos registrados en la base de datos.
   *
   * @returns Un arreglo de objetos Permission.
   * @throws InternalServerErrorException Si ocurre un error durante la consulta.
   *
   * ⚡ Cache: guarda/lee en `permissions:list`
   */
  async findAll(): Promise<Permission[]> {
    try {
      const cached = await this.cacheGet<Permission[]>(this.LIST_KEY);
      if (cached) return cached;

      const data = await this.permissionRepository.find();

      // Guarda en cache
      await this.cacheSet(this.LIST_KEY, data);

      return data;
    } catch {
      throw new InternalServerErrorException('Error al obtener los permisos');
    }
  }

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

      const permission = await this.permissionRepository.findOne({ where: { id } });
      if (!permission) {
        throw new NotFoundException(`Permission con ID ${id} no encontrado`);
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
      Object.assign(permission, updatePermissionDto);

      const saved = await this.permissionRepository.save(permission);

      // Invalida y precachea
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
      await this.permissionRepository.remove(permission);

      await this.invalidateListAndItems([id]);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al eliminar el permiso');
    }
  }

  /**
   * Asigna uno o varios permisos a un rol.
   *
   * @param createpermissionsRolesDto - Contiene el ID del rol y los IDs de los permisos a asignar.
   * @returns Un mensaje de confirmación de la asignación.
   * @throws NotFoundException Si el rol o alguno de los permisos no existen.
   * @throws InternalServerErrorException Si ocurre un error durante la asignación.
   *
   * 🧼 Cache: invalida lista y los items de los permisos afectados.
   */
  async assignPermissionsToRole(dto: CreatepermissionsRolesDto): Promise<string> {
    const { roleId, assignments } = dto;

    // 1. Validar rol
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
    });
    if (!role) throw new NotFoundException(`Rol con ID ${roleId} no existe`);

    // 2. Validar permisos & submenu
    for (const item of assignments) {
      const { permissionId, submenuId } = item;

      const perm = await this.permissionRepository.findOne({
        where: { id: permissionId },
      });
      if (!perm)
        throw new NotFoundException(
          `Permiso con ID ${permissionId} no existe`,
        );

      const submenu = await this.menuService.findOne(submenuId);
      if (!submenu)
        throw new NotFoundException(
          `Submenú con ID ${submenuId} no existe`,
        );
    }

    // 3. Crear registros en permisos_roles
    const records = assignments.map((item) =>
      this.rolePermissionRepository.create({
        roleId,
        permissionId: item.permissionId,
        submenuId: item.submenuId,
        isActive: true,
      }),
    );

    await this.rolePermissionRepository.save(records);

    // 4. Limpiar cache
    await this.invalidateListAndItems();

    return 'Permisos asignados correctamente al rol';
  }

    /**
   * Asignar TODOS los permisos activos a un rol para TODOS los menús cuyos slug estén en ModuleItemsMenu.
   * Crea registros en permisos_roles solo si no existen (evita duplicados).
   * Retorna resumen de la operación.
   */
  async assignAllPermissionsToRole(roleId: string): Promise<{
    roleId: string;
    totalMenus: number;
    totalPermissions: number;
    created: number;
    skipped: number;
  }> {
    // 1. Validar rol
    const role = await this.roleRepository.findOne({ where: { id: roleId }, relations: ['permissionsRoles'] });
    if (!role) throw new NotFoundException(`Rol con ID ${roleId} no existe`);

    // 2. Obtener todos los menús (submenús) cuyos slug estén en el enum
    const targetSlugs = Object.values(ModuleItemsMenu).map((v) => String(v).trim());
    const menus = await this.menuService['menuRepository'].find({
      where: { name: In(targetSlugs) },
    });

    if (!menus.length) {
      throw new NotFoundException('No se encontraron menús para los slugs definidos en ModuleItemsMenu');
    }

    const submenuIds = menus.map((m) => m.id);

    // 3. Permisos activos
    const permissions = await this.permissionRepository.find({ where: { isActive: true } });
    if (!permissions.length) {
      throw new NotFoundException('No hay permisos activos para asignar');
    }

    // 4. Existentes (para evitar duplicados)
    const existing = await this.rolePermissionRepository.find({
      where: {
        roleId,
        submenuId: In(submenuIds),
        permissionId: In(permissions.map((p) => p.id)),
      },
    });
    const existingKey = new Set(existing.map((e) => `${e.submenuId}:${e.permissionId}`));

    // 5. Construir nuevos registros
    const toCreate: PermissionRole[] = [];
    for (const submenuId of submenuIds) {
      for (const perm of permissions) {
        const key = `${submenuId}:${perm.id}`;
        if (existingKey.has(key)) continue;
        toCreate.push(
          this.rolePermissionRepository.create({
            roleId,
            submenuId,
            permissionId: perm.id,
            isActive: true,
          }),
        );
      }
    }

    // 6. Guardar
    let created = 0;
    if (toCreate.length) {
      await this.rolePermissionRepository.save(toCreate);
      created = toCreate.length;
    }

    // 7. Invalidar cache
    await this.invalidateListAndItems();

    return {
      roleId,
      totalMenus: menus.length,
      totalPermissions: permissions.length,
      created,
      skipped: existingKey.size,
    };
  }

}
