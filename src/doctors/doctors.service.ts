import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { detachDoctorFromCenter } from './doctor-center-detach';
import { findAllOrFail } from 'src/common/validation/find-all-or-fail';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assertDocumentAvailable,
  definedFields,
  personDocumentWhere,
  uniqueViolationToConflict,
} from 'src/common-person/person-document.util';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import {
  APPOINTMENT_CACHE_SCOPE,
  CACHE_TTL,
  getScoped,
  invalidateScope,
  setScoped,
} from 'src/common/cache/cache-registry';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { DataSource, FindOptions, In, IsNull, Repository } from 'typeorm';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { DoctorQueryDto } from './dto/doctor-query.dto';
import { Doctor } from './entities/doctor.entity';
import { DoctorImage } from './entities/doctor-image.entity';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { User } from 'src/user/entities/user.entity';
import { FilesService } from 'src/files/files.service';
import { toHttpException } from 'src/common/exceptions/to-http-exception';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectRepository(Doctor, DatabaseConnectionName.DB_MAIN)
    private readonly doctorRepository: Repository<Doctor>,

    @InjectRepository(CommonPerson, DatabaseConnectionName.DB_MAIN)
    private readonly commonPersonRepository: Repository<CommonPerson>,

    @InjectRepository(Specialty, DatabaseConnectionName.DB_MAIN)
    private readonly specialtyRepository: Repository<Specialty>,

    @InjectRepository(MedicalCenter, DatabaseConnectionName.DB_MAIN)
    private readonly medicalCenterRepository: Repository<MedicalCenter>,

    @InjectRepository(DoctorImage, DatabaseConnectionName.DB_MAIN)
    private readonly doctorImageRepository: Repository<DoctorImage>,

    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,

    private readonly filesService: FilesService,

    private readonly authContextService: AuthContextService,

    @InjectDataSource(DatabaseConnectionName.DB_MAIN)
    private readonly dataSource: DataSource,
  ) {}

  // ─── IDOR helpers ──────────────────────────────────────────────────────────

  private async assertDoctorAccess(doctorId: string, authUser?: any): Promise<void> {
    if (!authUser?.id) return;
    const myDoctorId = await this.authContextService.getScopedDoctorId(authUser.id);
    if (myDoctorId && myDoctorId !== doctorId) {
      throw new ForbiddenException('No tiene acceso a este perfil de doctor.');
    }
  }

  private async getDoctorImageUrl(doctorId: string): Promise<string | null> {
    const img = await this.doctorImageRepository.findOne({
      where: { doctorId, isActive: true, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return img ? this.filesService.getDoctorImageUrl(img.id) : null;
  }

  /**
   * Método para limpiar cache de paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    await invalidateScope(this.cacheManager, 'doctor');
    // Recipe and history details embed the doctor
    await invalidateScope(this.cacheManager, 'recipe');
    await invalidateScope(this.cacheManager, 'medical-history');
    // Center list counts and center detail embed the doctors (M-63)
    await invalidateScope(this.cacheManager, 'medicalCenter');
    // Department list and detail carry doctorsCount
    await invalidateScope(this.cacheManager, 'department');
    // Appointment views embed this entity: drop them too
    await invalidateScope(this.cacheManager, APPOINTMENT_CACHE_SCOPE);
  }

  /**
   * Crear doctor
   */
  async create(dto: CreateDoctorDto): Promise<Doctor> {
    try {
      if (!dto.commonPerson) {
        throw new BadRequestException(
          'La información de la persona es requerida para este endpoint.',
        );
      }

      // Everything that can fail with a 4xx is checked before writing, so no orphan person is left (M-25).
      // 1. Validar Especialidades
      let specialties: Specialty[] = [];
      if (dto.specialtyIds && dto.specialtyIds.length > 0) {
        specialties = await this.specialtyRepository.findBy({
          id: In(dto.specialtyIds),
          deletedAt: IsNull(),
        });
        if (specialties.length !== dto.specialtyIds.length) {
          throw new BadRequestException('Una o más especialidades no existen.');
        }
      }

      // 2. Validar que los centros médicos existan (si se proporcionan)
      let medicalCenters: MedicalCenter[] = [];
      if (dto.medicalCenterIds && dto.medicalCenterIds.length > 0) {
        medicalCenters = await this.medicalCenterRepository.findBy({
          id: In(dto.medicalCenterIds),
          deletedAt: IsNull(),
        });

        if (medicalCenters.length !== dto.medicalCenterIds.length) {
          throw new BadRequestException(
            'Uno o más centros médicos no existen.',
          );
        }
      }

      // 3. Validar que no exista otro doctor con el mismo número de licencia
      const existingDoctor = await this.doctorRepository.findOne({
        where: { licenseNumber: dto.licenseNumber },
      });

      if (existingDoctor) {
        throw new BadRequestException(
          'Ya existe un doctor con ese número de licencia.',
        );
      }

      // 4. Persona (buscar por letra + documento o crear) y doctor en una transacción
      const personDto = dto.commonPerson;
      const doctor = await this.dataSource.transaction(async (manager) => {
        const personRepo = manager.getRepository(CommonPerson);
        const doctorRepo = manager.getRepository(Doctor);

        let commonPerson: CommonPerson | null = null;
        if (personDto.documentNumber) {
          commonPerson = await personRepo.findOne({
            where: personDocumentWhere(personDto.letter, personDto.documentNumber),
          });
        }
        if (!commonPerson) {
          commonPerson = await personRepo.save(personRepo.create(personDto));
        }

        const newDoctor = doctorRepo.create({
          ...dto,
          commonPersonId: commonPerson.id,
          commonPerson,
          medicalCenters,
          specialties,
        });
        return doctorRepo.save(newDoctor);
      });

      // Limpiar cache global
      await this.cacheManager.del('doctor:all');
      await this.clearQueryCache();

      return doctor;
    } catch (error) {
      throw (
        uniqueViolationToConflict(error) ??
        toHttpException(error, 'Error al crear el doctor.')
      );
    }
  }

  /**
   * Listar doctores con filtros + paginación + cache
   */
  async findAll(query: DoctorQueryDto, authUser?: any) {
    const {
      page,
      limit,
      order,
      search,
      medicalCenterId,
      isActive,
      departmentId,
      documentNumber,
    } = query;

    // ── IDOR ──────────────────────────────────────────────────────────────────
    const myDoctorId = await this.authContextService.getScopedDoctorId(authUser?.id);

    const cacheKey = `doctor:query:${JSON.stringify({ ...query, myDoctorId })}`;

    // Consultar cache
    const cached = await getScoped(this.cacheManager, 'doctor', cacheKey);
    if (cached) return cached;

    // Construir QueryBuilder
    const qb = this.doctorRepository
      .createQueryBuilder('doctor')
      .leftJoinAndSelect('doctor.commonPerson', 'person')
      .leftJoinAndSelect('doctor.medicalCenters', 'centers')
      .leftJoinAndSelect('doctor.specialties', 'specialties')
      .where('doctor.deletedAt IS NULL');

    // Filtros
    if (search) {
      qb.andWhere(
        '(specialties.name ILIKE :search OR doctor.licenseNumber ILIKE :search OR person.firstName ILIKE :search OR person.lastName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (medicalCenterId) {
      qb.innerJoin('doctor.medicalCenters', 'mc', 'mc.id = :medicalCenterId', {
        medicalCenterId,
      });
    }

    if (departmentId) {
      qb.innerJoin('doctor.departments', 'dept', 'dept.id = :departmentId', {
        departmentId,
      });
    }

    if (isActive !== undefined) {
      qb.andWhere('doctor.isActive = :isActive', { isActive });
    }

    if (documentNumber) {
      qb.andWhere('person.documentNumber = :documentNumber', {
        documentNumber,
      });
    }

    // IDOR: si el usuario es doctor, solo ve su propio perfil
    if (myDoctorId) {
      qb.andWhere('doctor.id = :myDoctorId', { myDoctorId });
    }

    qb.orderBy('doctor.id', order);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const enrichedItems = await Promise.all(
      items.map(async (doctor) => ({
        ...doctor,
        imageUrl: await this.getDoctorImageUrl(doctor.id),
      })),
    );

    const result = { data: enrichedItems, total, page, limit };

    // Guardar en cache por 5 min
    await setScoped(this.cacheManager, 'doctor', cacheKey, result, CACHE_TTL.LIST);

    return result;
  }

  /**
   * Obtener doctor por ID con cache
   */
  async findOne(id: string, authUser?: any): Promise<Doctor & { imageUrl: string | null }> {
    const cacheKey = `doctor:${id}`;

    try {
      await this.assertDoctorAccess(id, authUser);

      const cached = await getScoped<Doctor & { imageUrl: string | null }>(this.cacheManager, 'doctor', cacheKey);
      if (cached) return cached;

      const doctor = await this.doctorRepository.findOne({
        where: { id, deletedAt: IsNull() },
        relations: ['commonPerson', 'medicalCenters', 'specialties'],
      });

      if (!doctor) {
        throw new NotFoundException(`Doctor con ID ${id} no encontrado.`);
      }

      const imageUrl = await this.getDoctorImageUrl(id);
      const result = { ...doctor, imageUrl };

      // Scoped: specialty and center edits change what it embeds
      await setScoped(this.cacheManager, 'doctor', cacheKey, result, CACHE_TTL.DETAIL);

      return result;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw toHttpException(error, 'Error al obtener el doctor.');
    }
  }

  /**
   * Actualizar doctor
   */
  async update(id: string, dto: UpdateDoctorDto, authUser?: any): Promise<Doctor> {
    await this.assertDoctorAccess(id, authUser);
    try {
      const doctor = await this.doctorRepository.findOne({
        where: { id, deletedAt: IsNull() },
        relations: ['commonPerson', 'medicalCenters', 'specialties'],
      });

      if (!doctor) {
        throw new NotFoundException(`Doctor con ID ${id} no encontrado.`);
      }

      // Activating or deactivating a doctor is an admin action; the edit form round-trips the current value.
      if (dto.isActive !== undefined && dto.isActive !== doctor.isActive) {
        await this.authContextService.assertAdmin(
          authUser?.id,
          'Solo un administrador puede activar o desactivar un médico.',
        );
      }

      // 1. Sincronizar Centros Médicos y Especialidades (ids inexistentes → 400, MJ-13)
      if (dto.medicalCenterIds) {
        const centers = await findAllOrFail(this.medicalCenterRepository, dto.medicalCenterIds, 'Centros médicos');
        const current = new Set(doctor.medicalCenters.map((mc) => mc.id));
        const requested = new Set(centers.map((mc) => mc.id));
        const removed = [...current].filter((id) => !requested.has(id));
        const changed = removed.length > 0 || [...requested].some((id) => !current.has(id));
        // The center list decides what the doctor sees: only an admin changes it (MJ-17).
        if (changed) {
          await this.authContextService.assertAdmin(
            authUser?.id,
            'Solo un administrador puede cambiar los centros médicos de un médico.',
          );
        }
        if (removed.length) {
          await this.doctorRepository.manager.transaction(async (manager) => {
            for (const centerId of removed) await detachDoctorFromCenter(manager, id, centerId);
          });
        }
        doctor.medicalCenters = centers;
      }

      if (dto.specialtyIds) {
        doctor.specialties = await findAllOrFail(this.specialtyRepository, dto.specialtyIds, 'Especialidades');
      }
      // 2. Actualizar CommonPerson si se proporciona
      if (dto.commonPerson && doctor.commonPerson) {
        await assertDocumentAvailable(this.commonPersonRepository, doctor.commonPerson, dto.commonPerson);
        Object.assign(doctor.commonPerson, definedFields(dto.commonPerson));
        await this.commonPersonRepository.save(doctor.commonPerson);
      }

      // 3. Actualizar campos directos del Doctor
      const { medicalCenterIds, specialtyIds, commonPerson, ...doctorData } =
        dto;
      Object.assign(doctor, doctorData);

      const updated = await this.doctorRepository.save(doctor);

      // Limpiar caches
      await this.cacheManager.del('doctor:all');
      await this.clearQueryCache();

      return updated;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw (
        uniqueViolationToConflict(error) ??
        toHttpException(error, 'Error al actualizar el doctor.')
      );
    }
  }

  /** Soft-deletes a doctor; only an admin can do it (MJ-16). */
  async remove(id: string, authUser?: any): Promise<void> {
    await this.authContextService.assertAdmin(
      authUser?.id,
      'Solo un administrador puede dar de baja a un médico.',
    );
    try {
      const doctor = await this.doctorRepository.findOneBy({ id, deletedAt: IsNull() });
      if (!doctor) {
        throw new NotFoundException(`Doctor con ID ${id} no encontrado.`);
      }

      doctor.deletedAt = new Date();
      await this.doctorRepository.save(doctor);

      await this.cacheManager.del('doctor:all');
      await this.clearQueryCache();
    } catch (error) {
      throw toHttpException(error, 'Error al eliminar el doctor.');
    }
  }
}
