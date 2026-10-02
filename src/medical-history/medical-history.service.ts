import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { nextCode } from 'src/common/sequence/next-code';
import {
  APPOINTMENT_CACHE_SCOPE,
  CACHE_TTL,
  getScoped,
  invalidateScope,
  setScoped,
} from 'src/common/cache/cache-registry';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { MedicalHistory } from './entities/medical-history.entity';
import { CreateMedicalHistoryDto } from './dto/create-medical-history.dto';
import { UpdateMedicalHistoryDto } from './dto/update-medical-history.dto';
import { CreateMedicalReviewDto } from './dto/create-medical-review.dto';
import { MedicalHistoryQueryDto } from './dto/medical-history-query.dto';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { User } from 'src/user/entities/user.entity';
import { FilesService } from 'src/files/files.service';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { toHttpException } from 'src/common/exceptions/to-http-exception';

/**
 * Servicio para gestionar el historial médico de los pacientes
 * Incluye CRUD completo con caché Redis, soft delete y funcionalidad de reseñas médicas
 */
@Injectable()
export class MedicalHistoryService {
  constructor(
    @InjectRepository(MedicalHistory, DatabaseConnectionName.DB_MAIN)
    private readonly medicalHistoryRepository: Repository<MedicalHistory>,

    @InjectRepository(Patient, DatabaseConnectionName.DB_MAIN)
    private readonly patientRepository: Repository<Patient>,

    @InjectRepository(Doctor, DatabaseConnectionName.DB_MAIN)
    private readonly doctorRepository: Repository<Doctor>,

    @InjectRepository(MedicalCenter, DatabaseConnectionName.DB_MAIN)
    private readonly medicalCenterRepository: Repository<MedicalCenter>,

    @InjectRepository(Specialty, DatabaseConnectionName.DB_MAIN)
    private readonly specialtyRepository: Repository<Specialty>,

    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,

    private readonly filesService: FilesService,

    private readonly authContextService: AuthContextService,
  ) {}

  private async enrichWithImages(record: any): Promise<any> {
    const [patientImageUrl, doctorImageUrl] = await Promise.all([
      record.patient?.commonPersonId
        ? this.filesService.getLatestCommonPersonImageUrl(record.patient.commonPersonId)
        : Promise.resolve(null),
      record.doctor?.id
        ? this.filesService.getLatestDoctorImageUrl(record.doctor.id)
        : Promise.resolve(null),
    ]);
    return {
      ...record,
      patient: record.patient ? { ...record.patient, imageUrl: patientImageUrl } : null,
      doctor: record.doctor ? { ...record.doctor, imageUrl: doctorImageUrl } : null,
    };
  }

  /**
   * 🔥 Método para limpiar cache de paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    await invalidateScope(this.cacheManager, 'medical-history');
    // Appointment views embed this entity: drop them too
    await invalidateScope(this.cacheManager, APPOINTMENT_CACHE_SCOPE);
  }

  /** Clears the global list caches; callers that pass their own transaction call it after commit. */
  async invalidateListCache(patientId?: string): Promise<void> {
    await this.cacheManager.del('medical-history:all');
    if (patientId) await this.cacheManager.del(`medical-history:patient:${patientId}`);
    await this.clearQueryCache();
  }

  /**
   * Genera un número de consulta único
   * Formato: CONS-YYYY-XXXXX (ej: CONS-2026-00001)
   */
  private async generateConsultationNumber(
    historyRepo: Repository<MedicalHistory> = this.medicalHistoryRepository,
  ): Promise<string> {
    return nextCode(historyRepo, 'CONS');
  }

  /**
   * Crear un nuevo registro de historial médico (inicio de consulta)
   * @param dto - Datos de la consulta médica
   * @param userId - ID del usuario que crea el registro (opcional)
   * @returns Historial médico creado
   */
  async create(
    dto: CreateMedicalHistoryDto,
    userId?: string,
    manager?: EntityManager,
  ): Promise<MedicalHistory> {
    // With a caller-owned transaction every read/write uses its manager and the caller clears caches.
    const repo = <T extends object>(entity: new () => T, fallback: Repository<T>) =>
      manager ? manager.getRepository(entity) : fallback;
    const historyRepo = repo(MedicalHistory, this.medicalHistoryRepository);
    try {
      // 1️⃣ Verificar que el paciente exista
      const patient = await repo(Patient, this.patientRepository).findOne({
        where: { id: dto.patientId, deletedAt: IsNull() },
      });

      if (!patient) {
        throw new BadRequestException(
          `El paciente con ID ${dto.patientId} no existe o ha sido eliminado.`,
        );
      }

      // 2️⃣ Verificar que el doctor exista
      const doctor = await repo(Doctor, this.doctorRepository).findOne({
        where: { id: dto.doctorId, deletedAt: IsNull() },
      });

      if (!doctor) {
        throw new BadRequestException(
          `El doctor con ID ${dto.doctorId} no existe o ha sido eliminado.`,
        );
      }

      // 3️⃣ Verificar centro médico si se proporciona
      if (dto.medicalCenterId) {
        const medicalCenter = await repo(MedicalCenter, this.medicalCenterRepository).findOne({
          where: { id: dto.medicalCenterId, deletedAt: IsNull() },
        });

        if (!medicalCenter) {
          throw new BadRequestException(
            `El centro médico con ID ${dto.medicalCenterId} no existe o ha sido eliminado.`,
          );
        }
      }

      // 4️⃣ Verificar especialidad si se proporciona
      if (dto.specialtyId) {
        const specialty = await repo(Specialty, this.specialtyRepository).findOne({
          where: { id: dto.specialtyId, deletedAt: IsNull() },
        });

        if (!specialty) {
          throw new BadRequestException(
            `La especialidad con ID ${dto.specialtyId} no existe o ha sido eliminada.`,
          );
        }
      }

      // 5️⃣ Generar número de consulta único
      const consultationNumber = await this.generateConsultationNumber(historyRepo);

      // 6️⃣ Crear el registro
      const newHistory = historyRepo.create({
        ...dto,
        consultationNumber,
        consultationDate: new Date(dto.consultationDate),
        status: 'in_progress',
        createdBy: userId,
      });

      const savedHistory = await historyRepo.save(newHistory);
      if (manager) return savedHistory;

      await this.invalidateListCache(savedHistory.patientId);

      // Retornar con relaciones cargadas
      return this.findOne(savedHistory.id);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw toHttpException(error, 'Error al crear el historial médico.');
    }
  }

  /**
   * Listar historiales médicos con filtros + paginación + cache
   * @param query - Parámetros de búsqueda y paginación
   * @returns Lista paginada de historiales médicos
   */
  async findAll(query: MedicalHistoryQueryDto, user?: any) {
    const {
      page,
      limit,
      order,
      search,
      patientId,
      doctorId,
      medicalCenterId,
      specialtyId,
      status,
      isActive,
      startDate,
      endDate,
    } = query;

    // IDOR: si el usuario es doctor, forzar su doctorId
    const effectiveDoctorId = (await this.authContextService.getScopedDoctorId(user?.id)) ?? doctorId;

    // 🔑 Key única para esta consulta
    const cacheKey = `medical-history:query:${JSON.stringify({ ...query, effectiveDoctorId })}`;

    // 1️⃣ Consultar cache
    const cached = await getScoped(this.cacheManager, 'medical-history', cacheKey);
    if (cached) return cached;

    // 2️⃣ Construir QueryBuilder
    const qb = this.medicalHistoryRepository
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.patient', 'patient')
      .leftJoinAndSelect('patient.commonPerson', 'patientPerson')
      .leftJoinAndSelect('history.doctor', 'doctor')
      .leftJoinAndSelect('doctor.commonPerson', 'doctorPerson')
      .leftJoinAndSelect('history.medicalCenter', 'medicalCenter')
      .leftJoinAndSelect('history.specialty', 'specialty')
      .where('history.deletedAt IS NULL');

    // 🔍 Filtros
    if (search) {
      qb.andWhere(
        '(history.consultationNumber ILIKE :search OR history.diagnosis ILIKE :search OR history.reasonForVisit ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (patientId) {
      qb.andWhere('history.patientId = :patientId', { patientId });
    }

    if (effectiveDoctorId) {
      qb.andWhere('history.doctorId = :doctorId', { doctorId: effectiveDoctorId });
    }

    if (medicalCenterId) {
      qb.andWhere('history.medicalCenterId = :medicalCenterId', { medicalCenterId });
    }

    if (specialtyId) {
      qb.andWhere('history.specialtyId = :specialtyId', { specialtyId });
    }

    if (status) {
      qb.andWhere('history.status = :status', { status });
    }

    if (isActive !== undefined) {
      qb.andWhere('history.isActive = :isActive', { isActive });
    }

    if (startDate) {
      qb.andWhere('history.consultationDate >= :startDate', {
        startDate: new Date(startDate),
      });
    }

    if (endDate) {
      qb.andWhere('history.consultationDate <= :endDate', {
        endDate: new Date(endDate),
      });
    }

    qb.orderBy('history.consultationDate', order);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const enriched = await Promise.all(items.map((h) => this.enrichWithImages(h)));
    const result = { data: enriched, total, page, limit };

    // 3️⃣ Guardar en cache por 5 min
    await setScoped(this.cacheManager, 'medical-history', cacheKey, result, CACHE_TTL.LIST);

    return result;
  }

  /**
   * Obtener un historial médico por ID con cache
   * @param id - ID del historial médico
   * @returns Historial médico encontrado con todas sus relaciones
   */
  async findOne(id: string, user?: any): Promise<MedicalHistory> {
    const cacheKey = `medical-history:${id}`;

    try {
      // Consultar cache
      const cached = await this.cacheManager.get<MedicalHistory>(cacheKey);
      if (cached) {
        // IDOR: verificar acceso del doctor al registro cacheado
        if (user) {
          const doctorId = await this.authContextService.getScopedDoctorId(user?.id);
          if (doctorId && cached.doctorId !== doctorId) {
            throw new ForbiddenException('No tiene acceso a este historial médico.');
          }
        }
        return cached;
      }

      const history = await this.medicalHistoryRepository.findOne({
        where: { id, deletedAt: IsNull() },
        relations: [
          'patient',
          'patient.commonPerson',
          'doctor',
          'doctor.commonPerson',
          'medicalCenter',
          'specialty',
        ],
      });

      if (!history) {
        throw new NotFoundException(
          `Historial médico con ID ${id} no encontrado.`,
        );
      }

      // IDOR: verificar que el doctor solo acceda a sus historiales
      if (user) {
        const doctorId = await this.authContextService.getScopedDoctorId(user?.id);
        if (doctorId && history.doctorId !== doctorId) {
          throw new ForbiddenException('No tiene acceso a este historial médico.');
        }
      }

      const enrichedHistory = await this.enrichWithImages(history);

      // Guardar en cache por 10 min
      await this.cacheManager.set(cacheKey, enrichedHistory, CACHE_TTL.DETAIL);

      return enrichedHistory;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) throw error;
      throw toHttpException(error, 'Error al obtener el historial médico.');
    }
  }

  /**
   * Obtener todo el historial médico de un paciente específico
   * @param patientId - ID del paciente
   * @returns Lista de historiales médicos del paciente
   */
  async findByPatient(patientId: string, user?: any): Promise<MedicalHistory[]> {
    const cacheKey = `medical-history:patient:${patientId}`;

    try {
      const cached = await this.cacheManager.get<MedicalHistory[]>(cacheKey);
      if (cached) {
        // IDOR: si es doctor, filtrar solo sus registros
        if (user) {
          const doctorId = await this.authContextService.getScopedDoctorId(user?.id);
          if (doctorId) return cached.filter(h => h.doctorId === doctorId);
        }
        return cached;
      }

      const whereClause: any = { patientId };

      // IDOR: si es doctor, solo sus historiales
      if (user) {
        const doctorId = await this.authContextService.getScopedDoctorId(user?.id);
        if (doctorId) whereClause.doctorId = doctorId;
      }

      const histories = await this.medicalHistoryRepository.find({
        where: whereClause,
        relations: [
          'doctor',
          'doctor.commonPerson',
          'medicalCenter',
          'specialty',
        ],
        order: { consultationDate: 'DESC' },
      });

      await this.cacheManager.set(cacheKey, histories, CACHE_TTL.LIST);

      return histories;
    } catch (error) {
      throw toHttpException(error, 'Error al obtener el historial del paciente.');
    }
  }

  /**
   * Actualizar un historial médico existente
   * @param id - ID del historial médico
   * @param dto - Datos a actualizar
   * @param userId - ID del usuario que actualiza (opcional)
   * @returns Historial médico actualizado
   */
  async update(
    id: string,
    dto: UpdateMedicalHistoryDto,
    userId?: string,
  ): Promise<MedicalHistory> {
    try {
      const history = await this.medicalHistoryRepository.findOne({
        where: { id, deletedAt: IsNull() },
      });

      if (!history) {
        throw new NotFoundException(
          `Historial médico con ID ${id} no encontrado.`,
        );
      }

      // No permitir actualizar consultas completadas o canceladas
      if (history.status !== 'in_progress') {
        throw new BadRequestException(
          'No se puede actualizar una consulta que ya ha sido completada o cancelada.',
        );
      }

      // Validaciones de relaciones si se actualizan
      if (dto.patientId && dto.patientId !== history.patientId) {
        const patient = await this.patientRepository.findOne({
          where: { id: dto.patientId, deletedAt: IsNull() },
        });
        if (!patient) {
          throw new BadRequestException(
            `El paciente con ID ${dto.patientId} no existe.`,
          );
        }
      }

      if (dto.doctorId && dto.doctorId !== history.doctorId) {
        const doctor = await this.doctorRepository.findOne({
          where: { id: dto.doctorId, deletedAt: IsNull() },
        });
        if (!doctor) {
          throw new BadRequestException(
            `El doctor con ID ${dto.doctorId} no existe.`,
          );
        }
      }

      await this.medicalHistoryRepository.update(id, {
        ...dto,
        consultationDate: dto.consultationDate
          ? new Date(dto.consultationDate)
          : undefined,
        updatedBy: userId,
      });

      // 🧹 Limpiar caches
      await this.cacheManager.del(`medical-history:${id}`);
      await this.cacheManager.del(`medical-history:patient:${history.patientId}`);
      await this.cacheManager.del('medical-history:all');
      await this.clearQueryCache();

      return this.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw toHttpException(error, 'Error al actualizar el historial médico.');
    }
  }

  /**
   * Agregar diagnóstico/reseña médica a una consulta
   * Este método es usado por el doctor para finalizar la consulta
   * @param dto - Datos del diagnóstico
   * @param userId - ID del usuario (doctor) que crea la reseña
   * @returns Historial médico actualizado con el diagnóstico
   */
  async createMedicalReview(
    dto: CreateMedicalReviewDto,
    userId?: string,
    user?: any,
  ): Promise<MedicalHistory> {
    try {
      const history = await this.medicalHistoryRepository.findOne({
        where: { id: dto.medicalHistoryId, deletedAt: IsNull() },
      });

      if (!history) {
        throw new NotFoundException(
          `Historial médico con ID ${dto.medicalHistoryId} no encontrado.`,
        );
      }

      // IDOR: solo el doctor asignado puede agregar diagnóstico
      if (user) {
        const doctorId = await this.authContextService.getScopedDoctorId(user?.id);
        if (doctorId && history.doctorId !== doctorId) {
          throw new ForbiddenException('Solo el doctor asignado puede agregar diagnóstico a esta consulta.');
        }
      }

      // Verificar que la consulta esté en progreso
      if (history.status !== 'in_progress') {
        throw new BadRequestException(
          'No se puede agregar diagnóstico a una consulta que ya ha sido completada o cancelada.',
        );
      }

      // Actualizar con el diagnóstico
      await this.medicalHistoryRepository.update(dto.medicalHistoryId, {
        diagnosis: dto.diagnosis,
        diagnosisCode: dto.diagnosisCode,
        treatmentPlan: dto.treatmentPlan,
        observations: dto.observations,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
        followUpNotes: dto.followUpNotes,
        status: 'completed',
        updatedBy: userId,
      });

      // 🧹 Limpiar caches
      await this.cacheManager.del(`medical-history:${dto.medicalHistoryId}`);
      await this.cacheManager.del(`medical-history:patient:${history.patientId}`);
      await this.cacheManager.del('medical-history:all');
      await this.clearQueryCache();

      return this.findOne(dto.medicalHistoryId);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw toHttpException(error, 'Error al crear la reseña médica.');
    }
  }

  /**
   * Cancelar una consulta médica
   * @param id - ID del historial médico
   * @param userId - ID del usuario que cancela
   * @returns Historial médico actualizado
   */
  async cancelConsultation(id: string, userId?: string, user?: any): Promise<MedicalHistory> {
    try {
      const history = await this.medicalHistoryRepository.findOne({
        where: { id, deletedAt: IsNull() },
      });

      if (!history) {
        throw new NotFoundException(
          `Historial médico con ID ${id} no encontrado.`,
        );
      }

      // IDOR: solo el doctor asignado puede cancelar la consulta
      if (user) {
        const doctorId = await this.authContextService.getScopedDoctorId(user?.id);
        if (doctorId && history.doctorId !== doctorId) {
          throw new ForbiddenException('Solo el doctor asignado puede cancelar esta consulta.');
        }
      }

      if (history.status === 'completed') {
        throw new BadRequestException(
          'No se puede cancelar una consulta que ya ha sido completada.',
        );
      }

      await this.medicalHistoryRepository.update(id, {
        status: 'cancelled',
        isActive: false,
        updatedBy: userId,
      });

      // 🧹 Limpiar caches
      await this.cacheManager.del(`medical-history:${id}`);
      await this.cacheManager.del(`medical-history:patient:${history.patientId}`);
      await this.cacheManager.del('medical-history:all');
      await this.clearQueryCache();

      return this.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw toHttpException(error, 'Error al cancelar la consulta.');
    }
  }

  /**
   * Eliminar un historial médico (soft delete)
   * @param id - ID del historial médico a eliminar
   */
  async remove(id: string): Promise<void> {
    try {
      const history = await this.findOne(id);

      if (!history) {
        throw new NotFoundException(
          `Historial médico con ID ${id} no encontrado.`,
        );
      }

      // Soft delete
      await this.medicalHistoryRepository.update(id, {
        deletedAt: new Date(),
        isActive: false,
      });

      // 🧹 Limpiar caches
      await this.cacheManager.del(`medical-history:${id}`);
      await this.cacheManager.del(`medical-history:patient:${history.patientId}`);
      await this.cacheManager.del('medical-history:all');
      await this.clearQueryCache();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw toHttpException(error, 'Error al eliminar el historial médico.');
    }
  }
}
