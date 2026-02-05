import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { IsNull, Repository } from 'typeorm';
import { MedicalHistory } from './entities/medical-history.entity';
import { CreateMedicalHistoryDto } from './dto/create-medical-history.dto';
import { UpdateMedicalHistoryDto } from './dto/update-medical-history.dto';
import { CreateMedicalReviewDto } from './dto/create-medical-review.dto';
import { MedicalHistoryQueryDto } from './dto/medical-history-query.dto';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';

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

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * 🔥 Método para limpiar cache de paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    const listKey = 'medical-history:query:keys';

    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];

    for (const key of keys) {
      await this.cacheManager.del(key);
    }

    await this.cacheManager.del(listKey);
  }

  /**
   * Genera un número de consulta único
   * Formato: CONS-YYYY-XXXXX (ej: CONS-2026-00001)
   */
  private async generateConsultationNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CONS-${year}-`;

    // Obtener el último número de consulta del año actual
    const lastHistory = await this.medicalHistoryRepository
      .createQueryBuilder('history')
      .where('history.consultationNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('history.consultationNumber', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (lastHistory) {
      const lastNumber = parseInt(lastHistory.consultationNumber.split('-')[2], 10);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
  }

  /**
   * Crear un nuevo registro de historial médico (inicio de consulta)
   * @param dto - Datos de la consulta médica
   * @param userId - ID del usuario que crea el registro (opcional)
   * @returns Historial médico creado
   */
  async create(
    dto: CreateMedicalHistoryDto,
    userId?: number,
  ): Promise<MedicalHistory> {
    try {
      // 1️⃣ Verificar que el paciente exista
      const patient = await this.patientRepository.findOne({
        where: { id: dto.patientId },
      });

      if (!patient) {
        throw new BadRequestException(
          `El paciente con ID ${dto.patientId} no existe o ha sido eliminado.`,
        );
      }

      // 2️⃣ Verificar que el doctor exista
      const doctor = await this.doctorRepository.findOne({
        where: { id: dto.doctorId },
      });

      if (!doctor) {
        throw new BadRequestException(
          `El doctor con ID ${dto.doctorId} no existe o ha sido eliminado.`,
        );
      }

      // 3️⃣ Verificar centro médico si se proporciona
      if (dto.medicalCenterId) {
        const medicalCenter = await this.medicalCenterRepository.findOne({
          where: { id: dto.medicalCenterId },
        });

        if (!medicalCenter) {
          throw new BadRequestException(
            `El centro médico con ID ${dto.medicalCenterId} no existe o ha sido eliminado.`,
          );
        }
      }

      // 4️⃣ Verificar especialidad si se proporciona
      if (dto.specialtyId) {
        const specialty = await this.specialtyRepository.findOne({
          where: { id: dto.specialtyId },
        });

        if (!specialty) {
          throw new BadRequestException(
            `La especialidad con ID ${dto.specialtyId} no existe o ha sido eliminada.`,
          );
        }
      }

      // 5️⃣ Generar número de consulta único
      const consultationNumber = await this.generateConsultationNumber();

      // 6️⃣ Crear el registro
      const newHistory = this.medicalHistoryRepository.create({
        ...dto,
        consultationNumber,
        consultationDate: new Date(dto.consultationDate),
        status: 'in_progress',
        createdBy: userId,
      });

      const savedHistory = await this.medicalHistoryRepository.save(newHistory);

      // 🧹 Limpiar cache global
      await this.cacheManager.del('medical-history:all');
      await this.clearQueryCache();

      // Retornar con relaciones cargadas
      return this.findOne(savedHistory.id);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Error al crear el historial médico: ${error.message}`,
      );
    }
  }

  /**
   * Listar historiales médicos con filtros + paginación + cache
   * @param query - Parámetros de búsqueda y paginación
   * @returns Lista paginada de historiales médicos
   */
  async findAll(query: MedicalHistoryQueryDto) {
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

    // 🔑 Key única para esta consulta
    const cacheKey = `medical-history:query:${JSON.stringify(query)}`;
    const listKey = 'medical-history:query:keys';

    // 1️⃣ Consultar cache
    const cached = await this.cacheManager.get(cacheKey);
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

    if (doctorId) {
      qb.andWhere('history.doctorId = :doctorId', { doctorId });
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

    const result = { data: items, total, page, limit };

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
   * Obtener un historial médico por ID con cache
   * @param id - ID del historial médico
   * @returns Historial médico encontrado con todas sus relaciones
   */
  async findOne(id: number): Promise<MedicalHistory> {
    const cacheKey = `medical-history:${id}`;

    try {
      // Consultar cache
      const cached = await this.cacheManager.get<MedicalHistory>(cacheKey);
      if (cached) return cached;

      const history = await this.medicalHistoryRepository.findOne({
        where: { id },
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

      // Guardar en cache por 10 min
      await this.cacheManager.set(cacheKey, history, 600);

      return history;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException(
        `Error al obtener el historial médico: ${error.message}`,
      );
    }
  }

  /**
   * Obtener todo el historial médico de un paciente específico
   * @param patientId - ID del paciente
   * @returns Lista de historiales médicos del paciente
   */
  async findByPatient(patientId: number): Promise<MedicalHistory[]> {
    const cacheKey = `medical-history:patient:${patientId}`;

    try {
      const cached = await this.cacheManager.get<MedicalHistory[]>(cacheKey);
      if (cached) return cached;

      const histories = await this.medicalHistoryRepository.find({
        where: { patientId },
        relations: [
          'doctor',
          'doctor.commonPerson',
          'medicalCenter',
          'specialty',
        ],
        order: { consultationDate: 'DESC' },
      });

      await this.cacheManager.set(cacheKey, histories, 300);

      return histories;
    } catch (error) {
      throw new NotFoundException(
        `Error al obtener el historial del paciente: ${error.message}`,
      );
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
    id: number,
    dto: UpdateMedicalHistoryDto,
    userId?: number,
  ): Promise<MedicalHistory> {
    try {
      const history = await this.medicalHistoryRepository.findOne({
        where: { id },
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
          where: { id: dto.patientId },
        });
        if (!patient) {
          throw new BadRequestException(
            `El paciente con ID ${dto.patientId} no existe.`,
          );
        }
      }

      if (dto.doctorId && dto.doctorId !== history.doctorId) {
        const doctor = await this.doctorRepository.findOne({
          where: { id: dto.doctorId },
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
      throw new BadRequestException(
        `Error al actualizar el historial médico: ${error.message}`,
      );
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
    userId?: number,
  ): Promise<MedicalHistory> {
    try {
      const history = await this.medicalHistoryRepository.findOne({
        where: { id: dto.medicalHistoryId },
      });

      if (!history) {
        throw new NotFoundException(
          `Historial médico con ID ${dto.medicalHistoryId} no encontrado.`,
        );
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
      throw new BadRequestException(
        `Error al crear la reseña médica: ${error.message}`,
      );
    }
  }

  /**
   * Cancelar una consulta médica
   * @param id - ID del historial médico
   * @param userId - ID del usuario que cancela
   * @returns Historial médico actualizado
   */
  async cancelConsultation(id: number, userId?: number): Promise<MedicalHistory> {
    try {
      const history = await this.medicalHistoryRepository.findOne({
        where: { id },
      });

      if (!history) {
        throw new NotFoundException(
          `Historial médico con ID ${id} no encontrado.`,
        );
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
      throw new BadRequestException(
        `Error al cancelar la consulta: ${error.message}`,
      );
    }
  }

  /**
   * Eliminar un historial médico (soft delete)
   * @param id - ID del historial médico a eliminar
   */
  async remove(id: number): Promise<void> {
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
      throw new NotFoundException(
        `Error al eliminar el historial médico: ${error.message}`,
      );
    }
  }
}
