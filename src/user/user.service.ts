import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Cache } from 'cache-manager';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Repository } from 'typeorm';

import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto copy';


@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<User>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  // ============================================================
  // 🔥 Limpiar todas las keys generadas por paginación
  // ============================================================

  private async clearQueryCache(): Promise<void> {
    const listKey = 'user:query:keys';

    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];

    for (const key of keys) {
      await this.cacheManager.del(key);
    }

    await this.cacheManager.del(listKey);
  }

  // ============================================================
  // 🟢 Crear usuario
  // ============================================================

  async create(
    dto: CreateUserDto,
  ): Promise<Omit<User, 'password'>> {
    try {
      const exists = await this.repo.findOne({
        where: { email: dto.email },
      });

      if (exists) {
        throw new BadRequestException('El correo electrónico ya está en uso.');
      }

      const hashedPassword = await bcrypt.hash(dto.password, 10);

      const entity = this.repo.create({
        ...dto,
        password: hashedPassword,
      });

      const saved = await this.repo.save(entity);

      const { password, ...rest } = saved;

      await this.cacheManager.del('user:all');
      await this.clearQueryCache();

      return rest;
    } catch (error) {
      throw new BadRequestException(
        `Error al crear el usuario: ${error.message}`,
      );
    }
  }

  // ============================================================
  // 🟢 Listar usuarios (paginación + filtros + cache)
  // ============================================================

  async findAll(query: UserQueryDto) {
    const { page, limit, order, search, roleId, status } = query;

    const cacheKey = `user:query:${JSON.stringify(query)}`;
    const listKey = 'user:query:keys';

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const qb = this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.deletedAt IS NULL');

    if (search) {
      qb.andWhere(
        '(user.name ILIKE :search OR user.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (roleId) qb.andWhere('user.roleId = :roleId', { roleId });

    if (status !== undefined) qb.andWhere('user.activo = :status', { status });

    qb.orderBy('user.id', order);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const sanitized = items.map(({ password, ...rest }) => rest);

    const result = { data: sanitized, total, page, limit };

    await this.cacheManager.set(cacheKey, result, 300);

    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];

    if (!keys.includes(cacheKey)) {
      keys.push(cacheKey);
      await this.cacheManager.set(listKey, keys);
    }

    return result;
  }

  // ============================================================
  // 🟢 Obtener usuario por ID
  // ============================================================

  async findOne(id: number): Promise<Omit<User, 'password'> | null> {
    const cacheKey = `user:${id}`;
    const cached = await this.cacheManager.get<Omit<User, 'password'>>(cacheKey);
 
    if (cached) return cached;

    const user = await this.repo.findOne({
      where: { id },
      relations: ['role'],
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
    }

    const { password, ...rest } = user;

    await this.cacheManager.set(cacheKey, rest, 600);

    return rest;
  }

  // ============================================================
  // 🟢 Actualizar usuario
  // ============================================================

  async update(
    id: number,
    dto: UpdateUserDto,
  ): Promise<Omit<User, 'password'> | null> {
    try {
      const exists = await this.repo.findOneBy({ id });

      if (!exists) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
      }

      if (dto.password) {
        dto.password = await bcrypt.hash(dto.password, 10);
      }

      await this.repo.update(id, dto);

      const updated = await this.repo.findOneBy({ id });

      if (!updated) {
        throw new NotFoundException('Error al actualizar el usuario.');
      }

      const { password, ...rest } = updated;

      await this.cacheManager.del(`user:${id}`);
      await this.cacheManager.del('user:all');
      await this.clearQueryCache();

      return rest;
    } catch (error) {
      throw new BadRequestException(
        `Error al actualizar el usuario: ${error.message}`,
      );
    }
  }

  // ============================================================
  // 🟢 Eliminar usuario
  // ============================================================

  async remove(id: number): Promise<void> {
    try {
      const user = await this.findOne(id);

      if (!user) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
      }

      await this.repo.delete(id);

      await this.cacheManager.del(`user:${id}`);
      await this.cacheManager.del('user:all');
      await this.clearQueryCache();
    } catch (error) {
      throw new NotFoundException(
        `Error al eliminar el usuario: ${error.message}`,
      );
    }
  }
}
