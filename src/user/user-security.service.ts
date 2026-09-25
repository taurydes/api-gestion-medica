import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Cache } from 'cache-manager';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Repository } from 'typeorm';
import { RedisSessionService } from 'src/redis-session/redis-session.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserSecurityQueryDto } from './dto/user-security-query.dto';
import { UserSecurity } from './entities/user.system.entity';
import { CreateUserSecurityDto } from './dto/create-user-security.dto';
import {
  resolveAdminFieldChanges,
  revokeSessionOrFail,
} from './user-admin-fields';

@Injectable()
export class UserSecurityService {
  constructor(
    @InjectRepository(UserSecurity, DatabaseConnectionName.DB_MAIN)
    private readonly userSecurityRepository: Repository<UserSecurity>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,

    private readonly redisSession: RedisSessionService,
  ) {}

  /**
   * 🔥 Método para limpiar cache de paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    const listKey = 'users-security:query:keys';

    // Recuperamos las keys almacenadas manualmente
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];

    // Eliminamos cada key asociada a consultas paginadas
    for (const key of keys) {
      await this.cacheManager.del(key);
    }

    // Finalmente limpiamos la lista de claves
    await this.cacheManager.del(listKey);
  }

  /**
   * Crear usuario
   */
  async create(
    createUserSecurityDto: CreateUserSecurityDto,
  ): Promise<Omit<UserSecurity, 'password'>> {
    try {
      const existingUser = await this.userSecurityRepository.findOne({
        where: { email: createUserSecurityDto.email },
      });

      if (existingUser) {
        throw new BadRequestException('El correo electrónico ya está en uso.');
      }

      const hashedPassword = await bcrypt.hash(
        createUserSecurityDto.password,
        10,
      );

      const newUser = this.userSecurityRepository.create({
        ...createUserSecurityDto,
        password: hashedPassword,
      });

      const user = await this.userSecurityRepository.save(newUser);
      const { password, ...rest } = user;

      // 🧹 limpiar cache global
      await this.cacheManager.del('userSecurity:all');
      await this.clearQueryCache();

      return rest;
    } catch (error) {
      throw new BadRequestException(
        `Error al crear el usuario: ${error.message}`,
      );
    }
  }

  /**
   * Listar usuarios con filtros + paginación + cache
   */
  async findAll(query: UserSecurityQueryDto) {
    const { page, limit, order, search, roleId, status } = query;

    // 🔑 Key única para esta consulta
    const cacheKey = `userSecurity:query:${JSON.stringify(query)}`;

    // 📌 Key donde guardamos TODAS las keys usadas por findAll
    const listKey = 'users:query:keys';

    // 1️⃣ Consultar cache
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    // 2️⃣ Construir QueryBuilder
    const qb = this.userSecurityRepository
      .createQueryBuilder('userSecurity')
      .leftJoinAndSelect('userSecurity.role', 'role')
      .leftJoinAndSelect('role.permissionsMenus', 'permissionsMenus')
      .leftJoinAndSelect('permissionsMenus.permission', 'permission')
      .where('userSecurity.deletedAt IS NULL');
    // 🔍 Filtros
    if (search) {
      qb.andWhere(
        '(userSecurity.name ILIKE :search OR userSecurity.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (roleId) qb.andWhere('userSecurity.roleId = :roleId', { roleId });
    if (status !== undefined)
      qb.andWhere('userSecurity.status = :status', { status });

    qb.orderBy('userSecurity.id', order);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    // 🧼 Eliminar passwords
    const sanitized = items.map(({ password, ...rest }) => rest);

    const result = { data: sanitized, total, page, limit };

    // 3️⃣ Guardar en cache por 5 min
    await this.cacheManager.set(cacheKey, result, 300);

    // 4️⃣ Registrar la key para poder limpiarla después
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];

    if (!keys.includes(cacheKey)) {
      keys.push(cacheKey);
      await this.cacheManager.set(listKey, keys);
    }

    return result;
  }

  /**
   * Obtener usuario por ID con cache
   */
  async findOne(id: string): Promise<Omit<UserSecurity, 'password'> | null> {
    const cacheKey = `userSecurity:${id}`;

    try {
      const cached =
        await this.cacheManager.get<Omit<UserSecurity, 'password'>>(cacheKey);
      if (cached) return cached;

      const user = await this.userSecurityRepository.findOne({
        where: { id },
        relations: [
          'role',
          'role.permissionsMenus',
          'role.permissionsMenus.permission',
        ],
      });

      if (!user) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
      }

      const { password, ...rest } = user;

      await this.cacheManager.set(cacheKey, rest, 600);

      return rest;
    } catch (error) {
      throw new NotFoundException(
        `Error al obtener el usuario: ${error.message}`,
      );
    }
  }

  /**
   * `roleId` y `status` siguen la misma regla que PATCH /users (ver `resolveAdminFieldChanges`).
   */
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    actorPermissions: string[] = [],
  ): Promise<Omit<UserSecurity, 'password'> | null> {
    try {
      const user = await this.userSecurityRepository.findOneBy({ id });

      if (!user) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
      }

      const {
        password: _password,
        roleId,
        status,
        ...userFields
      } = updateUserDto as any;
      const { fields, deactivates } = resolveAdminFieldChanges(
        user,
        { roleId, status },
        actorPermissions,
      );
      Object.assign(userFields, fields);

      // Revocar antes de escribir: si Redis falla, no queda nada persistido
      if (deactivates) {
        await revokeSessionOrFail(this.redisSession, id);
      }

      for (const key of Object.keys(userFields)) {
        if (userFields[key] === undefined) delete userFields[key];
      }
      if (Object.keys(userFields).length > 0) {
        await this.userSecurityRepository.update(id, userFields);
      }
      const updated = await this.userSecurityRepository.findOneBy({ id });

      if (!updated) {
        throw new NotFoundException('Error al actualizar el usuario.');
      }

      const { password, ...rest } = updated;

      // limpiar caches
      await this.cacheManager.del(`userSecurity:${id}`);
      await this.cacheManager.del('userSecurity:all');
      await this.clearQueryCache();

      return rest;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        `Error al actualizar el usuario: ${error.message}`,
      );
    }
  }

  /**
   * Eliminar usuario
   */
  async remove(id: string): Promise<void> {
    try {
      const user = await this.findOne(id);
      if (!user) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
      }

      // Revocar antes del borrado: si Redis falla, el usuario queda intacto
      await revokeSessionOrFail(this.redisSession, id);
      await this.userSecurityRepository.delete(id);

      await this.cacheManager.del(`userSecurity:${id}`);
      await this.cacheManager.del('userSecurity:all');
      await this.clearQueryCache();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new NotFoundException(
        `Error al eliminar el usuario: ${error.message}`,
      );
    }
  }
}
