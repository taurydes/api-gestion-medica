import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Cache } from 'cache-manager';
import { invalidatePermissionScopes, userAbilityScope } from 'src/common/cache/permission-cache';
import {
  CACHE_TTL,
  getScoped,
  invalidateScope,
  setScoped,
} from 'src/common/cache/cache-registry';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { User } from './entities/user.entity';
import { Role } from 'src/role/entities/role.entity';
import { RoleEnum } from 'src/role/role.const';
import { CommonPerson } from '../common-person/entities/common-person.entity';
import { CommonPersonImage } from '../common-person/entities/common-person-image.entity';
import {
  assertDocumentAvailable,
  PERSON_DOCUMENT_CONFLICT,
  personDocumentWhere,
  uniqueViolationToConflict,
} from '../common-person/person-document.util';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { FilesService } from 'src/files/files.service';
import { RedisSessionService } from 'src/redis-session/redis-session.service';
import {
  USER_CENTERS_CHANGE_PERMISSION,
  USER_PASSWORD_RESET_PERMISSION,
  resolveAdminFieldChanges,
  revokeSessionOrFail,
} from './user-admin-fields';
import { UserMedicalCenter } from './entities/user-medical-center.entity';
import { findUserCenters, replaceUserCenters } from './user-centers';
import { toHttpException } from 'src/common/exceptions/to-http-exception';
import { changedIdentity, normalizeIdentityFields, USER_IDENTITY_CONFLICT } from './user-identity';

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

    @InjectRepository(UserMedicalCenter, DatabaseConnectionName.DB_MAIN)
    private readonly userCentersRepo: Repository<UserMedicalCenter>,
  ) {}

  private assertCanChangeCenters(centerIds: string[] | undefined, actorPermissions: string[]): void {
    if (centerIds !== undefined && !actorPermissions.includes(USER_CENTERS_CHANGE_PERMISSION)) {
      throw new ForbiddenException('No tiene permiso para asignar centros médicos al usuario.');
    }
  }

  private async centerSummaries(userId: string): Promise<Array<{ id: string; name: string }>> {
    const centers = await findUserCenters(this.userCentersRepo, userId);
    return centers.map(({ id, name }) => ({ id, name }));
  }

  /** Effective photo: `commonPerson.photoUrl` (set by POST /files/profile-photo) wins over the legacy image table. */
  private async getUserImageUrl(
    person: Pick<CommonPerson, 'id' | 'photoUrl'> | null | undefined,
  ): Promise<string | null> {
    if (!person?.id) return null;
    if (person.photoUrl) return person.photoUrl;
    const img = await this.commonPersonImageRepo.findOne({
      where: { commonPersonId: person.id, isActive: true, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return img ? this.filesService.getCommonPersonImageUrl(img.id) : null;
  }

  // ============================================================
  // 🔥 Limpiar todas las keys generadas por paginación
  // ============================================================

  private async clearQueryCache(): Promise<void> {
    await invalidateScope(this.cacheManager, 'user');
  }

  /** 409 when another active user already holds the (normalized) name or email; the unique indexes back it up. */
  private async assertIdentityAvailable(
    data: { name?: string; email?: string },
    exceptId?: string,
  ): Promise<void> {
    if (data.name === undefined && data.email === undefined) return;
    const qb = this.repo
      .createQueryBuilder('u')
      .where('(lower(btrim(u.email)) = :email OR lower(btrim(u.name)) = :name)', {
        email: data.email ?? null,
        name: data.name ?? null,
      })
      // Same scope as the partial unique indexes: a deleted user frees its name and email (M-21).
      .andWhere('u.deletedAt IS NULL');
    if (exceptId) qb.andWhere('u.id <> :exceptId', { exceptId });
    if (await qb.getOne()) {
      throw new ConflictException(USER_IDENTITY_CONFLICT);
    }
  }

  private async validateUserData(data: CreateUserDto): Promise<void> {
    await this.assertIdentityAvailable(data);

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

  /** Explicit roleId wins; a doctor without one gets the `medico` role looked up by name (M-33). */
  private async resolveRoleId(
    manager: EntityManager,
    roleId: string | undefined,
    isDoctor: boolean,
  ): Promise<string> {
    if (roleId) return roleId;
    if (!isDoctor) {
      throw new BadRequestException('El rol es obligatorio (roleId).');
    }
    const role = await manager.getRepository(Role).findOne({
      where: { name: RoleEnum.DOCTOR, isActive: true, deletedAt: IsNull() },
    });
    if (!role) {
      throw new UnprocessableEntityException(
        `No existe un rol '${RoleEnum.DOCTOR}' activo para asignar al médico. Créelo o envíe roleId.`,
      );
    }
    return role.id;
  }

  // ============================================================
  // 🟢 Crear usuario
  // ============================================================

  async create(
    dto: CreateUserDto,
    actorPermissions: string[] = [],
    actorId: string | null = null,
  ): Promise<Omit<User, 'password'>> {
    this.assertCanChangeCenters(dto.medicalCenterIds, actorPermissions);
    normalizeIdentityFields(dto);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const {
        commonPerson: commonPersonDto,
        doctor: doctorDto,
        medicalCenterIds,
        ...data
      } = dto;

      // 1. Validar usuario existente (email / nombre)
      await this.validateUserData(dto);
      data.roleId = await this.resolveRoleId(queryRunner.manager, data.roleId, !!doctorDto);

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
      // users.common_person_id is the only link (M-23); a person that already has a user fails with 23505 → 409.
      await queryRunner.manager.save(user);
      if (medicalCenterIds?.length) {
        await replaceUserCenters(queryRunner.manager, user.id, medicalCenterIds, actorId);
      }

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

      // The form uploads the photo before the account exists, into the creator's folder: move it to the new user.
      // Already committed: a failed move keeps the original URL instead of failing the creation.
      try {
        const movedPhoto = actorId
          ? this.filesService.relocateProfilePhoto(commonPerson?.photoUrl, actorId, user.id)
          : null;
        if (movedPhoto && commonPerson) {
          await this.commonPersonrepo.update(commonPerson.id, { photoUrl: movedPhoto });
          commonPerson.photoUrl = movedPhoto;
        }
      } catch {
        // photo stays where it was uploaded
      }

      await this.cacheManager.del('user:all');
      await this.clearQueryCache();

      // Si se creó un doctor, limpiar también el caché de doctores
      if (doctorDto) {
        await this.cacheManager.del('doctor:all');
        await invalidateScope(this.cacheManager, 'doctor');
        // A new doctor changes the counts and detail of its centers
        await invalidateScope(this.cacheManager, 'medicalCenter');
      }

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release(); // Ensure release on error
      if (error instanceof ConflictException) throw error;
      throw (
        uniqueViolationToConflict(error) ??
        toHttpException(error, 'Error al crear el usuario.')
      );
    }
  }

  // ============================================================
  // 🟢 Listar usuarios (paginación + filtros + cache)
  // ============================================================

  async findAll(query: UserQueryDto) {
    const { page, limit, order, search, roleId, status } = query;

    const cacheKey = `user:query:${JSON.stringify(query)}`;

    const cached = await getScoped(this.cacheManager, 'user', cacheKey);
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
        imageUrl: await this.getUserImageUrl(rest.commonPerson),
      })),
    );

    const result = { data: enriched, total, page, limit };

    await setScoped(this.cacheManager, 'user', cacheKey, result, CACHE_TTL.LIST);

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

    const imageUrl = await this.getUserImageUrl(rest.commonPerson);

    const medicalCenters = await this.centerSummaries(id);
    const result = { ...rest, imageUrl, medicalCenters } as any;

    await this.cacheManager.set(cacheKey, result, CACHE_TTL.DETAIL);

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
    actorId: string | null = null,
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
        medicalCenterIds,
        ...userFields
      } = dto as any;
      this.assertCanChangeCenters(medicalCenterIds, actorPermissions);

      const { fields, deactivates } = resolveAdminFieldChanges(
        exists,
        { roleId, status },
        actorPermissions,
      );
      Object.assign(userFields, fields);
      normalizeIdentityFields(userFields);
      await this.assertIdentityAvailable(changedIdentity(userFields, exists), id);

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
      // users and persona_comun change together or not at all
      await this.dataSource.transaction(async (manager) => {
        if (Object.keys(userFields).length > 0) {
          await manager.getRepository(User).update(id, userFields);
        }
        if (commonPersonDto && exists.commonPerson?.id) {
          await manager
            .getRepository(CommonPerson)
            .update(exists.commonPerson.id, commonPersonDto);
        }
        if (medicalCenterIds !== undefined) {
          await replaceUserCenters(manager, id, medicalCenterIds, actorId);
        }
      });

      const updated = await this.repo.findOneBy({ id });

      if (!updated) {
        throw new NotFoundException('Error al actualizar el usuario.');
      }

      const { password, ...rest } = updated;

      await this.cacheManager.del(`user:${id}`);
      // A role or status change must reach the cached ability on the next request
      await invalidatePermissionScopes(this.cacheManager, userAbilityScope(id));
      await this.cacheManager.del('user:all');
      await this.clearQueryCache();

      return rest;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw (
        uniqueViolationToConflict(error) ??
        toHttpException(error, 'Error al actualizar el usuario.')
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

      const exists = await userRepo.findOne({ where: { id }, relations: ['commonPerson'] });
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

      // The person outlives the account while it is still a live patient or doctor (MJ-03).
      const personId = exists.commonPerson?.id;
      const stillUsed =
        !!personId &&
        ((await queryRunner.manager.getRepository(Patient).count({ where: { commonPersonId: personId, deletedAt: IsNull() } })) > 0 ||
          (await queryRunner.manager.getRepository(Doctor).count({ where: { commonPersonId: personId, deletedAt: IsNull() } })) > 0);
      if (personId && !stillUsed) {
        await cpRepo.update(personId, { deletedAt: now, updatedAt: now, isActive: false });
      }

      // Revocar antes del commit: si Redis falla, el rollback deja al usuario intacto
      await revokeSessionOrFail(this.redisSession, id);

      await queryRunner.commitTransaction();

      await this.cacheManager.del(`user:${id}`);
      // A role or status change must reach the cached ability on the next request
      await invalidatePermissionScopes(this.cacheManager, userAbilityScope(id));
      await this.cacheManager.del('user:all');
      await this.clearQueryCache();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof ServiceUnavailableException) throw error;
      throw toHttpException(error, 'Error al eliminar el usuario.');
    } finally {
      await queryRunner.release();
    }
  }

  /** Admin reset (MJ-05): temporary password, forced change on next login (firstLogin) and session revoked. */
  async resetPassword(id: string, newPassword: string, actorId: string | null, actorPermissions: string[]): Promise<{ message: string }> {
    if (!actorPermissions.includes(USER_PASSWORD_RESET_PERMISSION)) {
      throw new ForbiddenException('No tiene permiso para restablecer contraseñas.');
    }
    if (actorId === id) {
      throw new BadRequestException('Para cambiar su propia contraseña use PATCH /auth/change-password.');
    }
    const user = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
    }
    const password = await bcrypt.hash(newPassword, 10);
    await this.repo.update(id, { password, firstLogin: true, updatedAt: new Date() });
    // Any open session must log in again with the temporary password.
    await revokeSessionOrFail(this.redisSession, id);
    await this.cacheManager.del(`user:${id}`);
    return { message: 'Contraseña restablecida. El usuario deberá cambiarla al iniciar sesión.' };
  }

  /** Own profile (GET /auth/profile): GET /users/:id shape without password or the role's grants; null if not a regular user. */
  async getOwnProfile(userId: string) {
    const user = await this.repo.findOne({
      where: { id: userId, deletedAt: IsNull() },
      relations: { commonPerson: true, role: true },
    });
    if (!user) return null;

    const { password, role, ...rest } = user;
    const imageUrl = await this.getUserImageUrl(rest.commonPerson);
    return {
      ...rest,
      role: role ? { id: role.id, name: role.name } : null,
      imageUrl,
      medicalCenters: await this.centerSummaries(userId),
    };
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
