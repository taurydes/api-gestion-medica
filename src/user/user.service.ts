import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Cache } from 'cache-manager';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { DataSource, Repository } from 'typeorm';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto copy';
import { CommonPerson } from './entities/common-person.entity';
import { User } from './entities/user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<User>,

    @InjectRepository(CommonPerson, DatabaseConnectionName.DB_MAIN)
    private readonly commonPersonrepo: Repository<CommonPerson>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @InjectDataSource(DatabaseConnectionName.DB_MAIN)
    private readonly dataSource: DataSource,
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

  private async validateUserData(data: CreateUserDto): Promise<void> {
    const qb = this.repo
      .createQueryBuilder('u')
      .where('u.email = :email', { email: data.email })
      .orWhere('u.name = :name', { name: data.name });
    const existsUser = await qb.getOne();
    if (existsUser) {
      throw new BadRequestException(
        'El correo electrónico o nombre ya está en uso.',
      );
    }

    const qbPerson = this.commonPersonrepo
      .createQueryBuilder('u')
      .where('u.documentNumber = :documentNumber', {
        documentNumber: data.commonPerson.documentNumber,
      })
      .andWhere('u.letter = :letter', { letter: data.commonPerson.letter });
    const existsPerson = await qbPerson.getOne();
    if (existsPerson) {
      throw new BadRequestException(
        'el numero de documento ya está registrado.',
      );
    }
  }

  // ============================================================
  // 🟢 Crear usuario
  // ============================================================

  async create(dto: CreateUserDto): Promise<Omit<User, 'password'>> {
    try {
      const { commonPerson: _commonPerson, ...data } = dto;

      await this.validateUserData(dto);

      const hashedPassword = await bcrypt.hash(data.password, 10);

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const user = queryRunner.manager.create(User, {
        ...data,
        password: hashedPassword,
      });
      await queryRunner.manager.save(user);

      const commonPerson = queryRunner.manager.create(CommonPerson, {
        ..._commonPerson,
        userId: user.id,
      });

      await queryRunner.manager.save(commonPerson);

      await queryRunner.commitTransaction();
      await queryRunner.release();

      const { password, ...rest } = user;

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
      qb.andWhere('(user.name ILIKE :search OR user.email ILIKE :search)', {
        search: `%${search}%`,
      });
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
    const cached =
      await this.cacheManager.get<Omit<User, 'password'>>(cacheKey);

    if (cached) return cached;

    const user = await this.repo.findOne({
      where: { id },
      relations: [
          'role',
          'role.permissionsRoles',
          'role.permissionsRoles.permission',
        ],
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
  // 🟢 Eliminar usuario (soft delete en transacción)
  // ============================================================
  async remove(id: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userRepo = queryRunner.manager.getRepository(User);
      const cpRepo = queryRunner.manager.getRepository(CommonPerson);

      const exists = await userRepo.findOne({ where: { id } });
      if (!exists) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
      }

      const now = new Date();

      // Soft delete del usuario
      await userRepo.update(id, {
        deletedAt: now,
        updatedAt: now,
        status: false,
      });

      // Soft delete de persona_comun asociada (si existe)
      await cpRepo
        .createQueryBuilder()
        .update()
        .set({ deletedAt: now, updatedAt: now, isActive: false })
        .where('user_id = :id', { id })
        .execute();

      await queryRunner.commitTransaction();

      await this.cacheManager.del(`user:${id}`);
      await this.cacheManager.del('user:all');
      await this.clearQueryCache();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new NotFoundException(
        `Error al eliminar el usuario: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await queryRunner.release();
    }
  }
}
