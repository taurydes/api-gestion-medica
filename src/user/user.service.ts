import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Cache } from 'cache-manager';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { DataSource, In, IsNull, Repository } from 'typeorm';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserQueryDto } from './dto/user-query.dto copy';
import { User } from './entities/user.entity';
import { CommonPerson } from '../common-person/entities/common-person.entity';
import { CommonPersonImage } from '../common-person/entities/common-person-image.entity';
import {
  assertDocumentAvailable,
  PERSON_DOCUMENT_CONFLICT,
  personDocumentWhere,
  uniqueViolationToConflict,
} from '../common-person/person-document.util';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { FilesService } from 'src/files/files.service';
import { RedisSessionService } from 'src/redis-session/redis-session.service';
import {
  resolveAdminFieldChanges,
  revokeSessionOrFail,
} from './user-admin-fields';

export {
  USER_ROLE_CHANGE_PERMISSION,
  USER_STATUS_CHANGE_PERMISSION,
} from './user-admin-fields';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<User>,

    @InjectRepository(CommonPerson, DatabaseConnectionName.DB_MAIN)
    private readonly commonPersonrepo: Repository<CommonPerson>,

    @InjectRepository(CommonPersonImage, DatabaseConnectionName.DB_MAIN)
    private readonly commonPersonImageRepo: Repository<CommonPersonImage>,

    private readonly filesService: FilesService,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @InjectDataSource(DatabaseConnectionName.DB_MAIN)
    private readonly dataSource: DataSource,

    private readonly redisSession: RedisSessionService,
  ) {}

  private async getUserImageUrl(commonPersonId: string): Promise<string | null> {
    const img = await this.commonPersonImageRepo.findOne({
      where: { commonPersonId, isActive: true, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return img ? this.filesService.getCommonPersonImageUrl(img.id) : null;
  }

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
      .where('(u.email = :email OR u.name = :name)', { email: data.email, name: data.name })
      // Same scope as the partial unique indexes: a deleted user frees its name and email (M-21).
      .andWhere('u.deletedAt IS NULL');
    const existsUser = await qb.getOne();
    if (existsUser) {
      throw new BadRequestException(
        'El correo electrónico o nombre ya está en uso.',
      );
    }

    const { letter, documentNumber } = data.commonPerson;
    if (documentNumber) {
      const existsPerson = await this.commonPersonrepo.findOne({
        where: personDocumentWhere(letter, documentNumber),
      });
      if (existsPerson) {
        throw new ConflictException(PERSON_DOCUMENT_CONFLICT);
      }
    }
  }

  // ============================================================
  // 🟢 Crear usuario
  // ============================================================

  async create(dto: CreateUserDto): Promise<Omit<User, 'password'>> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { commonPerson: commonPersonDto, doctor: doctorDto, ...data } = dto;

      // 1. Validar usuario existente (email / nombre)
      await this.validateUserData(dto);

      // 2. Resolver CommonPerson por letra + documento (buscar solo por documento vinculaba a otra persona)
      let commonPerson: CommonPerson | null = null;
      if (commonPersonDto.documentNumber) {
        commonPerson = await this.commonPersonrepo.findOne({
          where: personDocumentWhere(commonPersonDto.letter, commonPersonDto.documentNumber),
        });
      }

      if (!commonPerson) {
        commonPerson = queryRunner.manager.create(
          CommonPerson,
          commonPersonDto,
        );
        commonPerson = await queryRunner.manager.save(commonPerson);
      }

      // 3. Crear Usuario
      const hashedPassword = await bcrypt.hash(data.password, 10);
      const user = queryRunner.manager.create(User, {
        ...data,
        password: hashedPassword,
        commonPerson: commonPerson, // Asignar relación
      });
      await queryRunner.manager.save(user);

      // Vincular CommonPerson con el Usuario (si no tenía usuario o actualizarlo)
      // Nota: Si commonPerson ya tenía usuario, esto lo sobrescribe.
      // Si se requiere validación de que commonPerson no tenga usuario, agregarla antes.
      commonPerson.userId = user.id;
      await queryRunner.manager.save(commonPerson);

      // 4. Crear Doctor (si aplica)
      let savedDoctor: Doctor | null = null;
      if (doctorDto) {
        // Validar Especialidades
        let specialties: Specialty[] = [];
        if (doctorDto.specialtyIds && doctorDto.specialtyIds.length > 0) {
          specialties = await queryRunner.manager
            .getRepository(Specialty)
            .findBy({ id: In(doctorDto.specialtyIds) });

          if (specialties.length !== doctorDto.specialtyIds.length) {
            throw new BadRequestException(
              `Una o más especialidades no existen.`,
            );
          }
        }

        let medicalCenters: MedicalCenter[] = [];
        // Validar Medical Centers (si se envían en el DTO)
        if (
          doctorDto.medicalCenterIds &&
          doctorDto.medicalCenterIds.length > 0
        ) {
          medicalCenters = await queryRunner.manager
            .getRepository(MedicalCenter)
            .findBy({ id: In(doctorDto.medicalCenterIds) });

          if (medicalCenters.length !== doctorDto.medicalCenterIds.length) {
            throw new BadRequestException(
              `Uno o más centros médicos no existen.`,
            );
          }
        }

        // Validar Licencia Duplicada
        const doctorExists = await queryRunner.manager
          .getRepository(Doctor)
          .findOneBy({ licenseNumber: doctorDto.licenseNumber });
        if (doctorExists) {
          throw new BadRequestException(
            'Ya existe un doctor con ese número de licencia.',
          );
        }

        const doctor = queryRunner.manager.create(Doctor, {
          ...doctorDto,
          commonPerson: commonPerson,
          medicalCenters: medicalCenters,
          specialties: specialties,
        });
        savedDoctor = await queryRunner.manager.save(doctor);
      }

      await queryRunner.commitTransaction();
      await queryRunner.release();

      const { password, ...rest } = user;
      const result = {
        ...rest,
        ...(savedDoctor ? { doctor: { id: savedDoctor.id } } : {}),
      };

      await this.cacheManager.del('user:all');
      await this.clearQueryCache();

      // Si se creó un doctor, limpiar también el caché de doctores
      if (doctorDto) {
        await this.cacheManager.del('doctor:all');
        const doctorListKey = 'doctor:query:keys';
        const doctorKeys = (await this.cacheManager.get<string[]>(doctorListKey)) ?? [];
        for (const key of doctorKeys) {
          await this.cacheManager.del(key);
        }
        await this.cacheManager.del(doctorListKey);
      }

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release(); // Ensure release on error
      if (error instanceof ConflictException) throw error;
      throw (
        uniqueViolationToConflict(error) ??
        new BadRequestException(`Error al crear el usuario: ${error.message}`)
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
      .leftJoinAndSelect('user.commonPerson', 'commonPerson')
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

    const enriched = await Promise.all(
      items.map(async ({ password, ...rest }) => ({
        ...rest,
        imageUrl: rest.commonPerson?.id
          ? await this.getUserImageUrl(rest.commonPerson.id)
          : null,
      })),
    );

    const result = { data: enriched, total, page, limit };

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

  async findOne(id: string): Promise<Omit<User, 'password'> | null> {
    const cacheKey = `user:${id}`;
    const cached =
      await this.cacheManager.get<Omit<User, 'password'>>(cacheKey);

    if (cached) return cached;

    const user = await this.repo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: {
        commonPerson: true,
        role: {
          permissionMenus: {
            permission: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
    }

    const { password, ...rest } = user;

    const imageUrl = rest.commonPerson?.id
      ? await this.getUserImageUrl(rest.commonPerson.id)
      : null;

    const result = { ...rest, imageUrl } as any;

    await this.cacheManager.set(cacheKey, result, 600);

    return result;
  }

  // ============================================================
  // 🟢 Actualizar usuario
  // ============================================================

  /**
   * `roleId` y `status` solo se aplican si cambian y el actor tiene el permiso de administración.
   * La contraseña nunca se cambia aquí: ver `PATCH /auth/change-password`.
   */
  async update(
    id: string,
    dto: UpdateUserDto,
    actorPermissions: string[] = [],
  ): Promise<Omit<User, 'password'> | null> {
    try {
      const exists = await this.repo.findOne({
        where: { id },
        relations: { commonPerson: true },
      });

      if (!exists) {
        throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
      }

      // Separar commonPerson del DTO — repo.update() no acepta relaciones anidadas
      const {
        commonPerson: commonPersonDto,
        password: _password,
        roleId,
        status,
        ...userFields
      } = dto as any;

      const { fields, deactivates } = resolveAdminFieldChanges(
        exists,
        { roleId, status },
        actorPermissions,
      );
      Object.assign(userFields, fields);

      if (commonPersonDto && exists.commonPerson) {
        await assertDocumentAvailable(this.commonPersonrepo, exists.commonPerson, commonPersonDto);
      }

      // Revocar antes de escribir: si Redis falla, no queda nada persistido
      if (deactivates) {
        await revokeSessionOrFail(this.redisSession, id);
      }

      for (const key of Object.keys(userFields)) {
        if (userFields[key] === undefined) delete userFields[key];
      }
      if (Object.keys(userFields).length > 0) {
        await this.repo.update(id, userFields);
      }

      // Actualizar CommonPerson por separado si se envió
      if (commonPersonDto && exists.commonPerson?.id) {
        await this.commonPersonrepo.update(exists.commonPerson.id, commonPersonDto);
      }

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
      if (error instanceof HttpException) throw error;
      throw (
        uniqueViolationToConflict(error) ??
        new BadRequestException(`Error al actualizar el usuario: ${error.message}`)
      );
    }
  }

  // ============================================================
  // 🟢 Eliminar usuario (soft delete en transacción)
  // ============================================================
  async remove(id: string): Promise<void> {
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

      // Revocar antes del commit: si Redis falla, el rollback deja al usuario intacto
      await revokeSessionOrFail(this.redisSession, id);

      await queryRunner.commitTransaction();

      await this.cacheManager.del(`user:${id}`);
      await this.cacheManager.del('user:all');
      await this.clearQueryCache();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof ServiceUnavailableException) throw error;
      throw new NotFoundException(
        `Error al eliminar el usuario: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /** Perfil propio: solo email y datos de persona; nunca rol, estado ni contraseña. */
  async updateProfile(
    id: string,
    dto: UpdateProfileDto,
  ): Promise<Omit<User, 'password'> | null> {
    const { email, commonPerson } = dto;
    return this.update(id, { email, commonPerson } as UpdateUserDto);
  }
}
