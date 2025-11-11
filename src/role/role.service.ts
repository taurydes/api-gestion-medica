import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Repository } from 'typeorm';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './entities/role.entity';

/**
 * Servicio: RoleService
 *
 * Gestiona las operaciones CRUD de roles,
 * incluyendo el uso de Redis Cache para optimizar consultas frecuentes.
 */
@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role, DatabaseConnectionName.DB_MAIN)
    private readonly roleRepository: Repository<Role>,
    @Inject(CACHE_MANAGER)  // ✅Inyectamos el cache global
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Crea un nuevo rol en la base de datos.
   */
  async create(createRoleDto: CreateRoleDto): Promise<Role> {
    try {
      const role = this.roleRepository.create(createRoleDto);
      const savedRole = await this.roleRepository.save(role);

      // 🧹 Invalida cache de roles (para forzar refresco)
      await this.cacheManager.del('roles:all');

      return savedRole;
    } catch {
      throw new InternalServerErrorException('Error al crear el rol');
    }
  }

  /**
   * Obtiene todos los roles registrados (con cache Redis).
   */
  async findAll(): Promise<Role[]> {
    try {
      // 🔹 1. Buscar en cache
      const cacheKey = 'roles:all';
      const cached = await this.cacheManager.get<Role[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // 🔹 2. Si no hay cache → consulta a DB
      const roles = await this.roleRepository.find();

      // 🔹 3. Guardar en cache por 5 minutos
      await this.cacheManager.set(cacheKey, roles, 300 /* segundos */);

      return roles;
    } catch {
      throw new InternalServerErrorException('Error al obtener los roles');
    }
  }

  /**
   * Busca un rol por su ID (usa cache individual por rol).
   */
  async findOne(id: number): Promise<Role> {
    const cacheKey = `role:${id}`;

    try {
      // 🔹 1. Revisar cache
      const cachedRole = await this.cacheManager.get<Role>(cacheKey);
      if (cachedRole) {
        return cachedRole;
      }

      // 🔹 2. Consultar DB
      const role = await this.roleRepository.findOne({
        where: { id },
        relations: ['permissionsRoles', 'permissionsRoles.permission'],
        select: {
          id: true,
          name: true,
          permissionsRoles: {
            id: true,
            active: true,
            permission: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!role) {
        throw new NotFoundException(`Rol con ID ${id} no encontrado`);
      }

      // 🔹 3. Guardar en cache individual
      await this.cacheManager.set(cacheKey, role,  600 );

      return role;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al obtener el rol');
    }
  }

  /**
   * Actualiza la información de un rol existente.
   */
  async update(id: number, updateRoleDto: UpdateRoleDto): Promise<Role> {
    try {
      const role = await this.findOne(id);
      Object.assign(role, updateRoleDto);
      const updated = await this.roleRepository.save(role);

      // 🧹 Limpiar cache del rol individual y la lista
      await this.cacheManager.del(`role:${id}`);
      await this.cacheManager.del('roles:all');

      return updated;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al actualizar el rol');
    }
  }

  /**
   * Elimina un rol de la base de datos.
   */
  async remove(id: number): Promise<void> {
    try {
      const role = await this.findOne(id);
      await this.roleRepository.remove(role);

      // 🧹 Limpiar cache relacionado
      await this.cacheManager.del(`role:${id}`);
      await this.cacheManager.del('roles:all');
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al eliminar el rol');
    }
  }
}
