import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Role } from './entities/role.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AuthUser } from 'src/auth/interfaces/User';
import { RoleQueryDto } from './dto/role-query.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role, DatabaseConnectionName.DB_MAIN)
    private readonly roleRepository: Repository<Role>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * 🔥 Limpia el cache de las paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    const listKey = 'roles:query:keys';

    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];

    for (const key of keys) {
      await this.cacheManager.del(key);
    }

    await this.cacheManager.del(listKey);
  }

  /**
   * Crear rol
   */
  async create(
    createRoleDto: CreateRoleDto,
    currentUser: AuthUser,
  ): Promise<Role> {
    try {
      const role = this.roleRepository.create({
        ...createRoleDto,
        userId: currentUser.id,
      });

      const saved = await this.roleRepository.save(role);

      await this.cacheManager.del('roles:all');
      await this.clearQueryCache();

      return saved;
    } catch (error) {
      throw new InternalServerErrorException(
        `Error al crear el rol: ${error.message}`,
      );
    }
  }

  /**
   * Listar roles con filtros + paginación + redis cache
   */
  async findAll(query: RoleQueryDto) {
    const { page, limit, order, search, userId, isActive } = query;

    const cacheKey = `roles:query:${JSON.stringify(query)}`;
    const listKey = 'roles:query:keys';

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const qb = this.roleRepository
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.permissionsRoles', 'permissionsRoles')
      .leftJoinAndSelect('permissionsRoles.permission', 'permission')
      .where('role.deletedAt IS NULL');

    // 🔍 Filtros
    if (search) {
      qb.andWhere('role.name ILIKE :search', { search: `%${search}%` });
    }

    if (userId) {
      qb.andWhere('role.userId = :userId', { userId });
    }

    if (isActive !== undefined) {
      qb.andWhere('role.isActive = :isActive', { isActive });
    }

    qb.orderBy('role.id', order);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const result = {
      data: items,
      total,
      page,
      limit,
    };

    // Guardar en cache por 5 min
    await this.cacheManager.set(cacheKey, result, 300);

    // Registrar keys para poder limpiarlas después
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    if (!keys.includes(cacheKey)) {
      keys.push(cacheKey);
      await this.cacheManager.set(listKey, keys);
    }

    return result;
  }

  /**
   * Obtener rol por ID
   */
  async findOne(id: string): Promise<Role> {
    const cacheKey = `role:${id}`;

    try {
      const cached = await this.cacheManager.get<Role>(cacheKey);
      if (cached) return cached;

      const role = await this.roleRepository.findOne({
        where: { id },
        relations: ['permissionsRoles', 'permissionsRoles.permission'],
      });

      if (!role) {
        throw new NotFoundException(`Rol con ID ${id} no encontrado`);
      }

      await this.cacheManager.set(cacheKey, role, 600);

      return role;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;

      throw new InternalServerErrorException(
        `Error al obtener el rol: ${error.message}`,
      );
    }
  }

  /**
   * Actualizar rol
   */
  async update(id: string, updateRoleDto: UpdateRoleDto): Promise<Role> {
    try {
      const role = await this.findOne(id);

      Object.assign(role, updateRoleDto);

      const updated = await this.roleRepository.save(role);

      await this.cacheManager.del(`role:${id}`);
      await this.cacheManager.del('roles:all');
      await this.clearQueryCache();

      return updated;
    } catch (error) {
      throw new InternalServerErrorException(
        `Error al actualizar el rol: ${error.message}`,
      );
    }
  }

  /**
   * Eliminar rol
   */
  async remove(id: string): Promise<void> {
    try {
      const role = await this.findOne(id);

      await this.roleRepository.remove(role);

      await this.cacheManager.del(`role:${id}`);
      await this.cacheManager.del('roles:all');
      await this.clearQueryCache();
    } catch (error) {
      throw new InternalServerErrorException(
        `Error al eliminar el rol: ${error.message}`,
      );
    }
  }
}
