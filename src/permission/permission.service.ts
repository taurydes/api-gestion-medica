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
import { CreatepermissionsRolesDto } from './dto/create-permission-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { Permission } from './entities/permission.entity';
import { PermissionRole } from './entities/Permission-role.entity';

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
  ) {}

  // -----------------------------
  // 🔒 Helpers de cache
  // -----------------------------
  private readonly LIST_KEY = 'permissions:list';
  private itemKey = (id: number) => `permissions:${id}`;
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
  private async invalidateListAndItems(ids: number[] = []) {
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
  async findOne(id: number): Promise<Permission> {
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
    id: number,
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
  async remove(id: number): Promise<void> {
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
  async assignPermissionsToRole(
    createpermissionsRolesDto: CreatepermissionsRolesDto,
  ): Promise<string> {
    try {
      const { roleId, permissionIds } = createpermissionsRolesDto;

      // Verifica que el rol exista
      const role = await this.roleRepository.findOne({ where: { id: roleId } });
      if (!role) throw new NotFoundException(`Role con ID ${roleId} no encontrado`);

      // Verifica que todos los permisos existan
      const permissions = await this.permissionRepository.find({
        where: { id: In(permissionIds) },
      });
      if (permissions.length !== permissionIds.length) {
        throw new NotFoundException('Uno o más permisos no fueron encontrados');
      }

      // Crea las relaciones entre rol y permisos
      const rolePermissions = permissions.map((perm) =>
        this.rolePermissionRepository.create({
          roleId,
          permissionId: perm.id,
        }),
      );

      await this.rolePermissionRepository.save(rolePermissions);

      // 🧼 Invalida cache de lista y de los permisos afectados
      await this.invalidateListAndItems(permissionIds);

      return 'Permisos asignados correctamente al rol';
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al asignar permisos al rol');
    }
  }
}
