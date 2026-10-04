import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { assertNoOpenAppointments } from 'src/medical-appointments/open-appointments';
import { detachDoctorFromCenter } from 'src/doctors/doctor-center-detach';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { uniqueViolationToConflict } from 'src/common-person/person-document.util';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import {
  APPOINTMENT_CACHE_SCOPE,
  CACHE_TTL,
  getScoped,
  invalidateScope,
  setScoped,
} from 'src/common/cache/cache-registry';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Department } from 'src/departments/entities/department.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { FilesService } from 'src/files/files.service';
import { User } from 'src/user/entities/user.entity';
import { IsNull, Repository } from 'typeorm';
import { CreateMedicalCenterDto } from './dto/create-medical-center.dto';
import { MedicalCenterQueryDto } from './dto/medical-center-query.dto';
import {
  MedicalCenterDetailDto,
  MedicalCenterPaginatedResponseDto,
  mapToMedicalCenterDetail,
  mapToMedicalCenterListItem,
} from './dto/medical-center-response.dto';
import { UpdateMedicalCenterDto } from './dto/update-medical-center.dto';
import { MedicalCenter } from './entities/medical-center.entity';
import { MedicalCenterImage } from './entities/medical-center-image.entity';
import { toHttpException } from 'src/common/exceptions/to-http-exception';

@Injectable()
export class MedicalCenterService {
  constructor(
    @InjectRepository(MedicalCenter, DatabaseConnectionName.DB_MAIN)
    private readonly medicalCenterRepository: Repository<MedicalCenter>,

    @InjectRepository(MedicalCenterImage, DatabaseConnectionName.DB_MAIN)
    private readonly medicalCenterImageRepository: Repository<MedicalCenterImage>,

    @InjectRepository(Doctor, DatabaseConnectionName.DB_MAIN)
    private readonly doctorRepository: Repository<Doctor>,

    @InjectRepository(Department, DatabaseConnectionName.DB_MAIN)
    private readonly departmentRepository: Repository<Department>,

    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,

    private readonly filesService: FilesService,

    private readonly authContextService: AuthContextService,
  ) {}

  // ─── IDOR helpers ──────────────────────────────────────────────────────────

  /**
   * Resuelve los IDs de centros médicos asociados al doctor del usuario.
   * Retorna null si el usuario no tiene perfil de doctor.
   */
  private async getMedicalCenterIdsForUser(
    userId: string,
  ): Promise<string[] | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['commonPerson'],
    });
    if (!user?.commonPerson) return null;

    const doctor = await this.doctorRepository.findOne({
      where: { commonPersonId: user.commonPerson.id },
      relations: ['medicalCenters'],
    });
    if (!doctor) return null;

    return doctor.medicalCenters?.map((mc) => mc.id) ?? [];
  }

  /**
   * Método para limpiar cache de paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    await invalidateScope(this.cacheManager, 'medicalCenter');
    // Doctor and history details embed the center
    await invalidateScope(this.cacheManager, 'doctor');
    await invalidateScope(this.cacheManager, 'medical-history');
    // Appointment (and patient) views embed this catalog
    await invalidateScope(this.cacheManager, APPOINTMENT_CACHE_SCOPE);
  }

  /**
   * Crear centro médico
   */
  async create(dto: CreateMedicalCenterDto): Promise<MedicalCenter> {
    try {
      const existingCenter = await this.medicalCenterRepository.findOne({
        where: { name: dto.name, deletedAt: IsNull() },
      });

      if (existingCenter) {
        throw new BadRequestException(
          'Ya existe un centro médico con ese nombre.',
        );
      }

      const newCenter = this.medicalCenterRepository.create(dto);
      const center = await this.medicalCenterRepository.save(newCenter);

      // Limpiar cache global
      await this.cacheManager.del('medicalCenter:all');
      await this.clearQueryCache();

      return center;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (uniqueViolationToConflict(error)) {
        throw new ConflictException('Ya existe un centro médico con ese nombre.');
      }
      throw toHttpException(error, 'Error al crear el centro médico.');
    }
  }

  /**
   * Listar centros médicos con filtros + paginación + cache.
   * IDOR:
   *  - Usuario con rol doctor → solo ve los centros médicos a los que está asignado.
   *  - Admin / enfermero / recepcionista / paciente → ve todos.
   */
  async findAll(
    query: MedicalCenterQueryDto,
    authUser?: any,
  ): Promise<MedicalCenterPaginatedResponseDto> {
    const { page, limit, order, search, isActive } = query;

    // ── IDOR ──────────────────────────────────────────────────────────────────
    let allowedCenterIds: string[] | null = null;

    // Solo un doctor no admin queda restringido; pacientes, enfermeros y recepcionistas ven todos
    if (await this.authContextService.getScopedDoctorId(authUser?.id)) {
      allowedCenterIds = (await this.getMedicalCenterIdsForUser(authUser.id)) ?? [];
    }

    const cacheKey = `medicalCenter:query:${JSON.stringify({ ...query, allowedCenterIds })}`;

    const cached =
      await getScoped<MedicalCenterPaginatedResponseDto>(this.cacheManager, 'medicalCenter', cacheKey);
    if (cached) return cached;

    // Construir QueryBuilder
    const qb = this.medicalCenterRepository
      .createQueryBuilder('mc')
      // Counts in SQL instead of loading both collections; soft-deleted rows do not count (M-63)
      .loadRelationCountAndMap('mc.doctorCount', 'mc.doctors', 'd', (q) =>
        q.andWhere('d.deletedAt IS NULL'),
      )
      .loadRelationCountAndMap('mc.departmentCount', 'mc.departments', 'dep', (q) =>
        q.andWhere('dep.deletedAt IS NULL'),
      )
      .leftJoinAndSelect('mc.images', 'images', 'images.deletedAt IS NULL AND images.isActive = true')
      .where('mc.deletedAt IS NULL');

    // Filtros
    if (search) {
      qb.andWhere(
        '(mc.name ILIKE :search OR mc.address ILIKE :search OR mc.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (isActive !== undefined) {
      qb.andWhere('mc.isActive = :isActive', { isActive });
    }

    // IDOR: si el doctor tiene centros asignados, filtrar por ellos
    if (allowedCenterIds !== null) {
      if (allowedCenterIds.length === 0) {
        // Doctor sin centros asignados: no debe ver ninguno
        return { data: [], total: 0, page, limit };
      }
      qb.andWhere('mc.id IN (:...allowedCenterIds)', { allowedCenterIds });
    }

    qb.orderBy('mc.id', order);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const result: MedicalCenterPaginatedResponseDto = {
      data: items.map((mc) =>
        mapToMedicalCenterListItem(mc, (id) => this.filesService.getMedicalCenterImageUrl(id))
      ),
      total,
      page,
      limit,
    };

    // Guardar en cache por 5 min
    await setScoped(this.cacheManager, 'medicalCenter', cacheKey, result, CACHE_TTL.LIST);

    return result;
  }

  /**
   * Obtener centro médico por ID con cache.
   * IDOR:
   *  - Usuario con rol doctor → solo puede ver centros a los que está asignado (403 si no).
   *  - Admin / enfermero / recepcionista / paciente → puede ver cualquiera.
   */
  async findOne(
    id: string,
    authUser?: any,
  ): Promise<MedicalCenterDetailDto> {
    const cacheKey = `medicalCenter:${id}`;

    try {
      const cached =
        await getScoped<MedicalCenterDetailDto>(this.cacheManager, 'medicalCenter', cacheKey);
      if (cached) {
        await this.assertFindOneAccess(id, authUser);
        return cached;
      }

      const center = await this.medicalCenterRepository
        .createQueryBuilder('mc')
        // deleted_at is a plain column, so joins do not skip soft-deleted rows by themselves
        .leftJoinAndSelect('mc.doctors', 'doctors', 'doctors.deletedAt IS NULL')
        .leftJoinAndSelect('doctors.commonPerson', 'commonPerson')
        .leftJoinAndSelect('doctors.specialties', 'specialties')
        .leftJoinAndSelect('mc.departments', 'departments', 'departments.deletedAt IS NULL')
        .leftJoinAndSelect(
          'mc.images',
          'images',
          'images.deletedAt IS NULL AND images.isActive = true',
        )
        .where('mc.id = :id', { id })
        .andWhere('mc.deletedAt IS NULL')
        .getOne();

      if (!center) {
        throw new NotFoundException(
          `Centro médico con ID ${id} no encontrado.`,
        );
      }

      // IDOR: validar acceso antes de cachear y retornar
      await this.assertFindOneAccess(id, authUser);

      const dto = mapToMedicalCenterDetail(
        center,
        (id) => this.filesService.getMedicalCenterImageUrl(id),
      );

      // In the list registry so department writes, which change the embedded departments, drop it too
      await setScoped(this.cacheManager, 'medicalCenter', cacheKey, dto, CACHE_TTL.DETAIL);

      return dto;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw toHttpException(error, 'Error al obtener el centro médico.');
    }
  }

  /**
   * Valida el acceso IDOR para findOne.
   * Si el usuario es doctor, verifica que el centro esté en su lista de asignados.
   */
  private async assertFindOneAccess(
    centerId: string,
    authUser?: any,
  ): Promise<void> {
    if (!authUser?.id) return;

    const myDoctorId = await this.authContextService.getScopedDoctorId(authUser.id);
    if (!myDoctorId) return; // No es doctor: puede ver cualquier centro

    const myCenterIds = await this.getMedicalCenterIdsForUser(authUser.id);
    if (myCenterIds && !myCenterIds.includes(centerId)) {
      throw new ForbiddenException(
        'No tiene acceso a este centro médico.',
      );
    }
  }

  /**
   * Actualizar centro médico
   */
  async update(
    id: string,
    dto: UpdateMedicalCenterDto,
  ): Promise<MedicalCenter> {
    try {
      const center = await this.medicalCenterRepository.findOneBy({ id });

      if (!center) {
        throw new NotFoundException(
          `Centro médico con ID ${id} no encontrado.`,
        );
      }

      await this.medicalCenterRepository.update(id, dto);
      const updated = await this.medicalCenterRepository.findOneBy({ id });

      if (!updated) {
        throw new NotFoundException('Error al actualizar el centro médico.');
      }
      

      // Limpiar caches
      await this.cacheManager.del(`medicalCenter:${id}`);
      await this.cacheManager.del('medicalCenter:all');
      await this.clearQueryCache();

      return updated;
    } catch (error) {
      throw toHttpException(error, 'Error al actualizar el centro médico.');
    }
  }

  /**
   * Eliminar centro médico (soft delete)
   */
  async remove(id: string): Promise<void> {
    try {
      const center = await this.medicalCenterRepository.findOneBy({ id, deletedAt: IsNull() });
      if (!center) {
        throw new NotFoundException(
          `Centro médico con ID ${id} no encontrado.`,
        );
      }
      await assertNoOpenAppointments(
        this.medicalCenterRepository.manager, { medicalCenterId: id }, 'eliminar el centro médico',
      );

      center.deletedAt = new Date();
      await this.medicalCenterRepository.save(center);

      await this.cacheManager.del(`medicalCenter:${id}`);
      await this.cacheManager.del('medicalCenter:all');
      await this.clearQueryCache();
    } catch (error) {
      throw toHttpException(error, 'Error al eliminar el centro médico.');
    }
  }

  /**
   * Listar imágenes activas de un centro médico.
   */
  async getImages(medicalCenterId: string): Promise<MedicalCenterImage[]> {
    const center = await this.medicalCenterRepository.findOne({
      where: { id: medicalCenterId, deletedAt: IsNull() },
    });
    if (!center) {
      throw new NotFoundException(
        `Centro médico con ID ${medicalCenterId} no encontrado.`,
      );
    }
    return this.medicalCenterImageRepository.find({
      where: { medicalCenterId, deletedAt: IsNull(), isActive: true },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Asignar un doctor a un centro médico (opcionalmente a un departamento)
   */
  async assignDoctor(
    medicalCenterId: string,
    doctorId: string,
    departmentId?: string,
  ): Promise<MedicalCenterDetailDto> {
    // Deleted centers, doctors and departments cannot be linked (MJ-15).
    const center = await this.medicalCenterRepository.findOne({
      where: { id: medicalCenterId, deletedAt: IsNull() },
      relations: ['doctors'],
    });

    if (!center) {
      throw new NotFoundException(
        `Centro médico con ID ${medicalCenterId} no encontrado.`,
      );
    }

    // Cargar el doctor con sus relaciones actuales
    const currentDoctor = await this.doctorRepository.findOne({
      where: { id: doctorId, deletedAt: IsNull() },
      relations: ['medicalCenters', 'departments', 'departments.doctors'],
    });

    if (!currentDoctor) {
      throw new NotFoundException(`Doctor con ID ${doctorId} no encontrado.`);
    }

    // 1. Asignar al Centro Médico si no está asignado
    const isAssignedToCenter = currentDoctor.medicalCenters.some(
      (mc) => mc.id === medicalCenterId,
    );

    if (!isAssignedToCenter) {
      currentDoctor.medicalCenters.push(center);
    }

    // 2. Asignar al Departamento si se proporciona y no está asignado
    if (departmentId) {
      const department = await this.departmentRepository.findOne({
        where: { id: departmentId, medicalCenterId: medicalCenterId, deletedAt: IsNull() },
      });

      if (!department) {
        throw new NotFoundException(
          `Departamento con ID ${departmentId} no pertenece a este centro médico o no existe.`,
        );
      }

      const isAssignedToDept = currentDoctor.departments.some(
        (dept) => dept.id === departmentId,
      );

      if (!isAssignedToDept) {
        currentDoctor.departments.push(department);
      }
    }

    await this.doctorRepository.save(currentDoctor);

    // Limpiar caches
    await this.cacheManager.del(`medicalCenter:${medicalCenterId}`);
    await this.cacheManager.del('medicalCenter:all');
    if (departmentId) {
      await this.cacheManager.del(`department:${departmentId}`);
    }
    await this.clearQueryCache();

    return this.findOne(medicalCenterId);
  }

  /**
   * Remover un doctor de un centro médico
   */
  async removeDoctor(
    medicalCenterId: string,
    doctorId: string,
  ): Promise<MedicalCenterDetailDto> {
    const center = await this.medicalCenterRepository.findOne({
      where: { id: medicalCenterId, deletedAt: IsNull() },
      relations: ['doctors'],
    });

    if (!center) {
      throw new NotFoundException(
        `Centro médico con ID ${medicalCenterId} no encontrado.`,
      );
    }

    // Verificar si está asignado
    const doctorIndex = center.doctors.findIndex((d) => d.id === doctorId);
    if (doctorIndex === -1) {
      throw new BadRequestException(
        'El doctor no está asignado a este centro médico.',
      );
    }

    // Also drops the doctor's departments and schedule of this center; 409 with open appointments (MJ-15).
    await this.medicalCenterRepository.manager.transaction((manager) =>
      detachDoctorFromCenter(manager, doctorId, medicalCenterId),
    );

    // Limpiar caches
    await this.cacheManager.del(`medicalCenter:${medicalCenterId}`);
    await this.cacheManager.del('medicalCenter:all');
    await this.clearQueryCache();

    return this.findOne(medicalCenterId);
  }
}
