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
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { IsNull, Repository } from 'typeorm';
import {
  AppointmentStatus,
  AppointmentType,
  MedicalAppointment,
} from './entities/medical-appointment.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Department } from 'src/departments/entities/department.entity';
import { CreateMedicalAppointmentDto } from './dto/create-medical-appointment.dto';
import { UpdateMedicalAppointmentDto } from './dto/update-medical-appointment.dto';
import { QueryMedicalAppointmentDto } from './dto/query-medical-appointment.dto';
import { Allergy } from 'src/parameters/entities/allergy.entity';
import { ChronicDisease } from 'src/parameters/entities/chronic-disease.entity';
import { Medication } from 'src/parameters/entities/medication.entity';
import { MedicalHistoryService } from 'src/medical-history/medical-history.service';
import { RecipeService } from 'src/recipe/recipe.service';
import { CompleteConsultationDto } from './dto/complete-consultation.dto';
import { User } from 'src/user/entities/user.entity';
import { DoctorScheduleService } from 'src/doctors/doctor-schedule.service';

@Injectable()
export class MedicalAppointmentsService {
  constructor(
    @InjectRepository(MedicalAppointment, DatabaseConnectionName.DB_MAIN)
    private readonly appointmentRepository: Repository<MedicalAppointment>,

    @InjectRepository(Patient, DatabaseConnectionName.DB_MAIN)
    private readonly patientRepository: Repository<Patient>,

    @InjectRepository(CommonPerson, DatabaseConnectionName.DB_MAIN)
    private readonly commonPersonRepository: Repository<CommonPerson>,

    @InjectRepository(Doctor, DatabaseConnectionName.DB_MAIN)
    private readonly doctorRepository: Repository<Doctor>,

    @InjectRepository(Specialty, DatabaseConnectionName.DB_MAIN)
    private readonly specialtyRepository: Repository<Specialty>,

    @InjectRepository(MedicalCenter, DatabaseConnectionName.DB_MAIN)
    private readonly medicalCenterRepository: Repository<MedicalCenter>,

    @InjectRepository(Department, DatabaseConnectionName.DB_MAIN)
    private readonly departmentRepository: Repository<Department>,

    @InjectRepository(Allergy, DatabaseConnectionName.DB_MAIN)
    private readonly allergyRepository: Repository<Allergy>,

    @InjectRepository(ChronicDisease, DatabaseConnectionName.DB_MAIN)
    private readonly chronicDiseaseRepository: Repository<ChronicDisease>,

    @InjectRepository(Medication, DatabaseConnectionName.DB_MAIN)
    private readonly medicationRepository: Repository<Medication>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,

    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,

    private readonly historyService: MedicalHistoryService,
    private readonly recipeService: RecipeService,
    private readonly scheduleService: DoctorScheduleService,
  ) {}

  // ─── IDOR helper ───────────────────────────────────────────────────────────

  /**
   * Resuelve el doctorId vinculado al usuario autenticado.
   * Retorna null si el usuario no es un doctor.
   */
  private async getDoctorIdForUser(userId: string): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['commonPerson'],
    });
    if (!user?.commonPerson) return null;

    const doctor = await this.doctorRepository.findOne({
      where: { commonPersonId: user.commonPerson.id },
    });
    return doctor?.id ?? null;
  }

  /**
   * Resuelve los IDs de centros médicos asociados al doctor del usuario.
   * Retorna null si el usuario no es un doctor.
   */
  private async getMedicalCenterIdsForUser(userId: string): Promise<string[] | null> {
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
   * Verifica si el usuario tiene rol de administrador.
   * Los admins no están sujetos a restricciones IDOR aunque tengan perfil de doctor.
   */
  private async isAdminUser(userId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['role'],
    });
    const roleName = (user?.role?.name ?? '').toLowerCase();
    return roleName.includes('admin') || roleName.includes('super');
  }

  // ─── Cache helpers ─────────────────────────────────────────────────────────

  private async clearQueryCache(): Promise<void> {
    const listKey = 'appointment:query:keys';
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    for (const key of keys) {
      await this.cacheManager.del(key);
    }
    await this.cacheManager.del(listKey);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Genera un número único de cita: APT-YYYY-XXXXX
   */
  private async generateAppointmentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `APT-${year}-`;

    const last = await this.appointmentRepository
      .createQueryBuilder('apt')
      .where('apt.appointmentNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('apt.appointmentNumber', 'DESC')
      .getOne();

    let nextNum = 1;
    if (last) {
      const parts = last.appointmentNumber.split('-');
      nextNum = parseInt(parts[2], 10) + 1;
    }

    return `${prefix}${nextNum.toString().padStart(5, '0')}`;
  }

  /**
   * Busca o crea un paciente según documentNumber o patientId
   */
  private async resolvePatient(
    dto: CreateMedicalAppointmentDto,
    userId?: string,
  ): Promise<Patient> {
    // Si se proporcionó patientId, buscar directamente
    if (dto.patientId) {
      const patient = await this.patientRepository.findOne({
        where: { id: dto.patientId, deletedAt: IsNull() },
        relations: ['commonPerson'],
      });
      if (!patient) {
        throw new NotFoundException(
          `Paciente con ID ${dto.patientId} no encontrado.`,
        );
      }
      return patient;
    }

    // Buscar CommonPerson por documentNumber
    if (!dto.documentNumber) {
      throw new BadRequestException(
        'Se requiere patientId o documentNumber para identificar al paciente.',
      );
    }

    const whereCommon: any = {
      documentNumber: dto.documentNumber,
      deletedAt: IsNull(),
    };
    if (dto.documentLetter) whereCommon.letter = dto.documentLetter;

    let commonPerson = await this.commonPersonRepository.findOne({
      where: whereCommon,
    });

    // Crear CommonPerson si no existe
    if (!commonPerson) {
      if (!dto.newPatientData?.commonPerson) {
        throw new BadRequestException(
          `No se encontró ninguna persona con documento ${dto.documentLetter ?? ''}${dto.documentNumber}. Proporcione newPatientData para registrarla.`,
        );
      }
      commonPerson = this.commonPersonRepository.create({
        ...dto.newPatientData.commonPerson,
        documentNumber: dto.documentNumber,
        letter: dto.documentLetter ?? null,
      });
      commonPerson = await this.commonPersonRepository.save(commonPerson);
    }

    // Verificar si ya existe un paciente con este commonPersonId
    let patient = await this.patientRepository.findOne({
      where: { commonPersonId: commonPerson.id, deletedAt: IsNull() },
      relations: ['commonPerson'],
    });

    if (!patient) {
      // Generar código de paciente
      const year = new Date().getFullYear();
      const prefix = `PAC-${year}-`;
      const lastPatient = await this.patientRepository
        .createQueryBuilder('p')
        .where('p.patientCode LIKE :prefix', { prefix: `${prefix}%` })
        .orderBy('p.patientCode', 'DESC')
        .getOne();

      let nextNum = 1;
      if (lastPatient) {
        nextNum = parseInt(lastPatient.patientCode.split('-')[2], 10) + 1;
      }
      const patientCode = `${prefix}${nextNum.toString().padStart(5, '0')}`;

      const newPatient = this.patientRepository.create({
        commonPersonId: commonPerson.id,
        commonPerson,
        patientCode,
      });
      // Set audit field separately to avoid DeepPartial type conflict with null
      (newPatient as any).createdBy = userId ?? null;
      const savedPatient = await this.patientRepository.save(newPatient);

      // Recargar con relaciones
      const reloaded = await this.patientRepository.findOne({
        where: { id: savedPatient.id },
        relations: ['commonPerson'],
      });
      if (!reloaded) {
        throw new BadRequestException(
          'Error al crear el paciente automáticamente.',
        );
      }
      patient = reloaded;
    }

    return patient;
  }

  /**
   * Verifica que no haya citas solapadas para el mismo médico
   */
  private async checkDoubleBooking(
    doctorId: string,
    appointmentDate: Date,
    durationMinutes: number,
    excludeId?: string,
  ): Promise<void> {
    const endTime = new Date(
      appointmentDate.getTime() + durationMinutes * 60 * 1000,
    );

    const qb = this.appointmentRepository
      .createQueryBuilder('apt')
      .where('apt.doctorId = :doctorId', { doctorId })
      .andWhere('apt.deletedAt IS NULL')
      .andWhere('apt.status NOT IN (:...statuses)', {
        statuses: [AppointmentStatus.CANCELLED],
      })
      .andWhere(
        // Rango se solapa si: inicio < fin_nueva AND fin > inicio_nueva
        "apt.appointmentDate < :endTime AND (apt.appointmentDate + (apt.durationMinutes * interval '1 minute')) > :startTime",
        { startTime: appointmentDate, endTime },
      );

    if (excludeId) {
      qb.andWhere('apt.id != :excludeId', { excludeId });
    }

    const conflict = await qb.getOne();
    if (conflict) {
      throw new BadRequestException(
        `El médico ya tiene una cita programada que se solapa con el horario solicitado (Cita #${conflict.appointmentNumber}).`,
      );
    }
  }

  /**
   * Valida que el doctor tenga horario configurado el día de la cita
   * en el centro médico indicado.
   */
  private async validateDoctorSchedule(
    doctorId: string,
    medicalCenterId: string,
    appointmentDate: Date,
  ): Promise<void> {
    const dayOfWeek = appointmentDate.getDay(); // 0=Domingo ... 6=Sábado
    const schedules = await this.scheduleService.getScheduleForDoctorOnDay(
      doctorId,
      medicalCenterId,
      dayOfWeek,
    );

    if (!schedules.length) {
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      throw new BadRequestException(
        `El doctor no tiene horario configurado para el día ${dayNames[dayOfWeek]} en este centro médico.`,
      );
    }

    // Validar que la hora de la cita esté dentro de algún bloque horario
    const appointmentTime = appointmentDate.toTimeString().slice(0, 5); // HH:mm
    const inBlock = schedules.some(
      (s) => appointmentTime >= s.startTime && appointmentTime < s.endTime,
    );
    if (!inBlock) {
      throw new BadRequestException(
        `La hora ${appointmentTime} no está dentro del horario del doctor en este centro médico.`,
      );
    }
  }

  /**
   * Valida que el doctor no haya superado el máximo de citas diarias
   * configurado en su horario para ese centro médico.
   */
  private async validateDailyAppointmentLimit(
    doctorId: string,
    medicalCenterId: string,
    appointmentDate: Date,
    excludeId?: string,
  ): Promise<void> {
    const dayOfWeek = appointmentDate.getDay();
    const schedules = await this.scheduleService.getScheduleForDoctorOnDay(
      doctorId,
      medicalCenterId,
      dayOfWeek,
    );

    if (!schedules.length) return; // Sin horario = sin límite (ya se validó antes)

    // Tomar el máximo diario del primer bloque (se aplica a nivel día)
    const maxDaily = schedules[0].maxDailyAppointments || 20;

    // Contar citas activas del doctor ese día en ese centro
    const dayStart = new Date(appointmentDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(appointmentDate);
    dayEnd.setHours(23, 59, 59, 999);

    const qb = this.appointmentRepository
      .createQueryBuilder('apt')
      .where('apt.doctorId = :doctorId', { doctorId })
      .andWhere('apt.medicalCenterId = :medicalCenterId', { medicalCenterId })
      .andWhere('apt.deletedAt IS NULL')
      .andWhere('apt.status NOT IN (:...statuses)', {
        statuses: [AppointmentStatus.CANCELLED],
      })
      .andWhere('apt.appointmentDate BETWEEN :dayStart AND :dayEnd', {
        dayStart,
        dayEnd,
      });

    if (excludeId) {
      qb.andWhere('apt.id != :excludeId', { excludeId });
    }

    const currentCount = await qb.getCount();

    if (currentCount >= maxDaily) {
      throw new BadRequestException(
        `El doctor ya alcanzó el máximo de ${maxDaily} citas para este día en este centro médico.`,
      );
    }
  }

  // ─── Cargar relaciones completas ───────────────────────────────────────────

  private async loadFullAppointment(id: string): Promise<MedicalAppointment> {
    const apt = await this.appointmentRepository
      .createQueryBuilder('apt')
      .leftJoinAndSelect('apt.patient', 'patient')
      .leftJoinAndSelect('patient.commonPerson', 'patientPerson')
      .leftJoinAndSelect('patient.allergies', 'allergies')
      .leftJoinAndSelect('patient.chronicDiseases', 'chronicDiseases')
      .leftJoinAndSelect('patient.medications', 'medications')
      .leftJoinAndSelect('apt.doctor', 'doctor')
      .leftJoinAndSelect('doctor.commonPerson', 'doctorPerson')
      .leftJoinAndSelect('doctor.specialties', 'doctorSpecialty')
      .leftJoinAndSelect('apt.specialty', 'specialty')
      .leftJoinAndSelect('apt.medicalCenter', 'medicalCenter')
      .leftJoinAndSelect('apt.department', 'department')
      .leftJoinAndSelect('apt.medicalHistory', 'medicalHistory')
      .leftJoinAndSelect('apt.recipes', 'recipes')
      .leftJoinAndSelect('recipes.items', 'recipeItems')
      .leftJoinAndSelect('recipeItems.medication', 'itemMedication')
      .where('apt.id = :id', { id })
      .andWhere('apt.deletedAt IS NULL')
      .getOne();

    if (!apt) {
      throw new NotFoundException(`Cita médica con ID ${id} no encontrada.`);
    }

    return apt;
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  /**
   * Crear una nueva cita médica
   * - Resuelve o crea al paciente
   * - Valida que la fecha no sea en el pasado
   * - Verifica disponibilidad del médico
   */
  async create(
    dto: CreateMedicalAppointmentDto,
    userId?: string,
  ): Promise<MedicalAppointment> {
    try {
      const appointmentDate = new Date(dto.appointmentDate);

      // Validar que la fecha no sea en el pasado
      if (appointmentDate <= new Date()) {
        throw new BadRequestException(
          'La fecha de la cita no puede ser en el pasado.',
        );
      }

      // Resolver paciente (busca o crea)
      const patient = await this.resolvePatient(dto, userId);

      // Validar que el paciente no tenga otra cita a la misma hora
      const patientConflict = await this.appointmentRepository
        .createQueryBuilder('apt')
        .where('apt.patientId = :patientId', { patientId: patient.id })
        .andWhere('apt.deletedAt IS NULL')
        .andWhere('apt.status NOT IN (:...statuses)', {
          statuses: [AppointmentStatus.CANCELLED],
        })
        .andWhere(
          "apt.appointmentDate < :endTime AND (apt.appointmentDate + (apt.durationMinutes * interval '1 minute')) > :startTime",
          {
            startTime: appointmentDate,
            endTime: new Date(
              appointmentDate.getTime() +
                (dto.durationMinutes ?? 30) * 60 * 1000,
            ),
          },
        )
        .getOne();

      if (patientConflict) {
        throw new BadRequestException(
          `El paciente ya tiene una cita programada en ese horario (Cita #${patientConflict.appointmentNumber}).`,
        );
      }

      // Validar médico
      const doctor = await this.doctorRepository.findOne({
        where: { id: dto.doctorId, deletedAt: IsNull() },
      });
      if (!doctor) {
        throw new NotFoundException(
          `Médico con ID ${dto.doctorId} no encontrado.`,
        );
      }

      // Verificar no solapamiento con otras citas del médico
      await this.checkDoubleBooking(
        dto.doctorId,
        appointmentDate,
        dto.durationMinutes ?? 30,
      );

      // Validar horario del doctor en el centro médico
      if (dto.medicalCenterId) {
        await this.validateDoctorSchedule(
          dto.doctorId,
          dto.medicalCenterId,
          appointmentDate,
        );
        await this.validateDailyAppointmentLimit(
          dto.doctorId,
          dto.medicalCenterId,
          appointmentDate,
        );
      }

      // Validar specialty, center y department si se proporcionan
      if (dto.specialtyId) {
        const specialty = await this.specialtyRepository.findOne({
          where: { id: dto.specialtyId },
        });
        if (!specialty) {
          throw new NotFoundException(
            `Especialidad con ID ${dto.specialtyId} no encontrada.`,
          );
        }
      }

      if (dto.medicalCenterId) {
        const center = await this.medicalCenterRepository.findOne({
          where: { id: dto.medicalCenterId },
        });
        if (!center) {
          throw new NotFoundException(
            `Centro médico con ID ${dto.medicalCenterId} no encontrado.`,
          );
        }
      }

      if (dto.departmentId) {
        const dept = await this.departmentRepository.findOne({
          where: { id: dto.departmentId },
        });
        if (!dept) {
          throw new NotFoundException(
            `Departamento con ID ${dto.departmentId} no encontrado.`,
          );
        }
      }

      const appointmentNumber = await this.generateAppointmentNumber();

      const newAppointment = this.appointmentRepository.create({
        appointmentNumber,
        appointmentDate,
        durationMinutes: dto.durationMinutes ?? 30,
        status: dto.status ?? AppointmentStatus.PENDING,
        type: dto.type ?? AppointmentType.FIRST_VISIT,
        reason: dto.reason,
        observations: dto.observations ?? null,
        patientId: patient.id,
        doctorId: dto.doctorId,
        specialtyId: dto.specialtyId ?? null,
        medicalCenterId: dto.medicalCenterId ?? null,
        departmentId: dto.departmentId ?? null,
        createdBy: userId ?? null,
      });

      const saved = await this.appointmentRepository.save(newAppointment);

      await this.cacheManager.del('appointment:all');
      await this.clearQueryCache();

      return this.loadFullAppointment(saved.id);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        throw error;
      throw new BadRequestException(
        `Error al crear la cita médica: ${error.message}`,
      );
    }
  }

  /**
   * Listar citas con filtros y paginación.
   * IDOR: si el usuario es doctor, solo ve sus propias citas.
   */
  async findAll(query: QueryMedicalAppointmentDto, authUser?: any) {
    const {
      page,
      limit,
      order,
      search,
      patientId,
      doctorId,
      specialtyId,
      medicalCenterId,
      departmentId,
      status,
      type,
      dateFrom,
      dateTo,
    } = query;

    // IDOR: forzar filtro por doctorId solo si el usuario es doctor Y no es admin
    let effectiveDoctorId = doctorId;
    let effectiveMedicalCenterId = medicalCenterId;
    if (authUser?.id) {
      const myDoctorId = await this.getDoctorIdForUser(authUser.id);
      if (myDoctorId) {
        const isAdmin = await this.isAdminUser(authUser.id);
        if (!isAdmin) {
          effectiveDoctorId = myDoctorId;
          // Filtrar por centro médico: si pidió uno, validar que sea suyo
          const myCenterIds = await this.getMedicalCenterIdsForUser(authUser.id);
          if (myCenterIds?.length) {
            if (medicalCenterId && !myCenterIds.includes(medicalCenterId)) {
              throw new ForbiddenException('No tiene acceso a este centro médico.');
            }
          }
        }
      }
    }

    const cacheKey = `appointment:query:${JSON.stringify({ ...query, effectiveDoctorId })}`;
    const listKey = 'appointment:query:keys';

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const qb = this.appointmentRepository
      .createQueryBuilder('apt')
      .leftJoinAndSelect('apt.patient', 'patient')
      .leftJoinAndSelect('patient.commonPerson', 'patientPerson')
      .leftJoinAndSelect('apt.doctor', 'doctor')
      .leftJoinAndSelect('doctor.commonPerson', 'doctorPerson')
      .leftJoinAndSelect('apt.specialty', 'specialty')
      .leftJoinAndSelect('apt.medicalCenter', 'medicalCenter')
      .leftJoinAndSelect('apt.department', 'department')
      .where('apt.deletedAt IS NULL');

    if (search) {
      qb.andWhere(
        '(patientPerson.firstName ILIKE :s OR patientPerson.lastName ILIKE :s OR patientPerson.documentNumber ILIKE :s OR apt.appointmentNumber ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    if (patientId) qb.andWhere('apt.patientId = :patientId', { patientId });
    if (effectiveDoctorId) qb.andWhere('apt.doctorId = :doctorId', { doctorId: effectiveDoctorId });
    if (specialtyId)
      qb.andWhere('apt.specialtyId = :specialtyId', { specialtyId });
    if (medicalCenterId)
      qb.andWhere('apt.medicalCenterId = :medicalCenterId', {
        medicalCenterId,
      });
    if (departmentId)
      qb.andWhere('apt.departmentId = :departmentId', { departmentId });
    if (status) qb.andWhere('apt.status = :status', { status });
    if (type) qb.andWhere('apt.type = :type', { type });
    if (dateFrom) qb.andWhere('apt.appointmentDate >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('apt.appointmentDate <= :dateTo', { dateTo });

    qb.orderBy('apt.appointmentDate', order)
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const result = { data: items, total, page, limit };

    await this.cacheManager.set(cacheKey, result, 300);

    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    if (!keys.includes(cacheKey)) {
      keys.push(cacheKey);
      await this.cacheManager.set(listKey, keys);
    }

    return result;
  }

  /**
   * Obtener una cita por ID con todas sus relaciones.
   * IDOR: si el usuario es doctor, solo puede ver sus propias citas.
   */
  async findOne(id: string, authUser?: any): Promise<MedicalAppointment> {
    const cacheKey = `appointment:${id}`;
    const cached = await this.cacheManager.get<MedicalAppointment>(cacheKey);

    const apt = cached ?? await this.loadFullAppointment(id);

    // IDOR: validar que doctor solo acceda a sus citas (los admins pueden ver cualquiera)
    if (authUser?.id) {
      const myDoctorId = await this.getDoctorIdForUser(authUser.id);
      if (myDoctorId && apt.doctorId !== myDoctorId) {
        const isAdmin = await this.isAdminUser(authUser.id);
        if (!isAdmin) {
          throw new ForbiddenException('No tiene acceso a esta cita médica.');
        }
      }
    }

    if (!cached) {
      await this.cacheManager.set(cacheKey, apt, 600);
    }
    return apt;
  }

  /**
   * Actualizar una cita médica
   */
  async update(
    id: string,
    dto: UpdateMedicalAppointmentDto,
    userId?: string,
  ): Promise<MedicalAppointment> {
    const apt = await this.appointmentRepository.findOne({ where: { id } });

    if (!apt) {
      throw new NotFoundException(`Cita médica con ID ${id} no encontrada.`);
    }

    if (apt.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException(
        'No se puede modificar una cita ya completada.',
      );
    }

    if (apt.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede modificar una cita cancelada.',
      );
    }

    if (dto.appointmentDate) {
      const newDate = new Date(dto.appointmentDate);
      if (newDate <= new Date()) {
        throw new BadRequestException(
          'La fecha de la cita no puede ser en el pasado.',
        );
      }
      await this.checkDoubleBooking(
        dto.doctorId ?? apt.doctorId,
        newDate,
        dto.durationMinutes ?? apt.durationMinutes,
        id,
      );
      apt.appointmentDate = newDate;
    }

    const {
      patientId: _p,
      documentNumber: _d,
      documentLetter: _l,
      newPatientData: _n,
      appointmentDate: _a,
      ...rest
    } = dto;

    Object.assign(apt, { ...rest, updatedBy: userId ?? null });

    await this.appointmentRepository.save(apt);

    await this.cacheManager.del(`appointment:${id}`);
    await this.cacheManager.del('appointment:all');
    await this.clearQueryCache();

    return this.loadFullAppointment(id);
  }

  /**
   * Cancelar una cita
   */
  async cancel(
    id: string,
    cancellationReason: string,
    userId?: string,
  ): Promise<MedicalAppointment> {
    const apt = await this.appointmentRepository.findOne({ where: { id } });

    if (!apt) {
      throw new NotFoundException(`Cita médica con ID ${id} no encontrada.`);
    }

    if (apt.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException(
        'No se puede cancelar una cita ya completada.',
      );
    }

    if (apt.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('La cita ya está cancelada.');
    }

    apt.status = AppointmentStatus.CANCELLED;
    apt.cancellationReason = cancellationReason ?? null;
    apt.updatedBy = userId ?? null;

    await this.appointmentRepository.save(apt);

    await this.cacheManager.del(`appointment:${id}`);
    await this.cacheManager.del('appointment:all');
    await this.clearQueryCache();

    return this.loadFullAppointment(id);
  }

  /**
   * Completar una cita
   */
  async complete(id: string, userId?: string): Promise<MedicalAppointment> {
    const apt = await this.appointmentRepository.findOne({ where: { id } });

    if (!apt) {
      throw new NotFoundException(`Cita médica con ID ${id} no encontrada.`);
    }

    if (apt.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede completar una cita cancelada.',
      );
    }

    if (apt.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('La cita ya está marcada como completada.');
    }

    apt.status = AppointmentStatus.COMPLETED;
    apt.updatedBy = userId ?? null;

    await this.appointmentRepository.save(apt);

    await this.cacheManager.del(`appointment:${id}`);
    await this.cacheManager.del('appointment:all');
    await this.clearQueryCache();

    return this.loadFullAppointment(id);
  }

  /**
   * Finalizar consulta médica completa
   * 1. Crea el historial médico vinculado a la cita
   * 2. Crea la receta médica vinculada al historial (opcional)
   * 3. Marca la cita como completada
   */
  async finishConsultation(
    id: string,
    dto: CompleteConsultationDto,
    userId?: string,
  ): Promise<MedicalAppointment> {
    const apt = await this.appointmentRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!apt) {
      throw new NotFoundException(`Cita médica con ID ${id} no encontrada.`);
    }

    if (apt.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('La cita ya está completada.');
    }

    // 1️⃣ Crear Historial Médico
    const historyDto = {
      ...dto.medicalHistory,
      medicalAppointmentId: id,
      patientId: apt.patientId,
      doctorId: apt.doctorId,
      medicalCenterId: apt.medicalCenterId ?? undefined,
      specialtyId: apt.specialtyId ?? undefined,
    };

    const history = await this.historyService.create(historyDto, userId);

    // 2️⃣ Crear Receta si se proporciona
    if (dto.recipe) {
      const recipeDto = {
        ...dto.recipe,
        medicalHistoryId: history.id,
        medicalAppointmentId: id,
        patientId: apt.patientId,
        doctorId: apt.doctorId,
      };
      await this.recipeService.create(recipeDto as any, userId);
    }

    // 3️⃣ Marcar cita como completada
    apt.status = AppointmentStatus.COMPLETED;
    if (dto.observations) apt.observations = dto.observations;
    apt.updatedBy = userId ?? null;

    await this.appointmentRepository.save(apt);

    // Limpiar caches
    await this.cacheManager.del(`appointment:${id}`);
    await this.cacheManager.del('appointment:all');
    await this.clearQueryCache();

    return this.loadFullAppointment(id);
  }

  /**
   * Soft-delete de una cita
   */
  async remove(id: string, userId?: string): Promise<void> {
    const apt = await this.appointmentRepository.findOne({ where: { id } });

    if (!apt) {
      throw new NotFoundException(`Cita médica con ID ${id} no encontrada.`);
    }

    apt.deletedAt = new Date();
    apt.isActive = false;
    apt.updatedBy = userId ?? null;
    await this.appointmentRepository.save(apt);

    await this.cacheManager.del(`appointment:${id}`);
    await this.cacheManager.del('appointment:all');
    await this.clearQueryCache();
  }

  // ─── Métodos especiales ────────────────────────────────────────────────────

  /**
   * Obtener historial de citas de un paciente.
   * IDOR: si el usuario es doctor, solo ve citas donde él es el doctor.
   */
  async getPatientHistory(
    patientId: string,
    query: QueryMedicalAppointmentDto,
    authUser?: any,
  ) {
    const { page, limit, order, status, dateFrom, dateTo } = query;

    const patient = await this.patientRepository.findOne({
      where: { id: patientId, deletedAt: IsNull() },
    });
    if (!patient) {
      throw new NotFoundException(
        `Paciente con ID ${patientId} no encontrado.`,
      );
    }

    const cacheKey = `appointment:patient:${patientId}:${JSON.stringify(query)}`;
    const listKey = 'appointment:query:keys';
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const qb = this.appointmentRepository
      .createQueryBuilder('apt')
      .leftJoinAndSelect('apt.patient', 'patient')
      .leftJoinAndSelect('patient.commonPerson', 'patientPerson')
      .leftJoinAndSelect('apt.doctor', 'doctor')
      .leftJoinAndSelect('doctor.commonPerson', 'doctorPerson')
      .leftJoinAndSelect('apt.specialty', 'specialty')
      .leftJoinAndSelect('apt.medicalCenter', 'medicalCenter')
      .leftJoinAndSelect('apt.medicalHistory', 'medicalHistory')
      .leftJoinAndSelect('apt.recipes', 'recipes')
      .where('apt.patientId = :patientId', { patientId })
      .andWhere('apt.deletedAt IS NULL');

    // IDOR: si el usuario es doctor, solo ve las citas donde es el doctor asignado
    if (authUser?.id) {
      const myDoctorId = await this.getDoctorIdForUser(authUser.id);
      if (myDoctorId) {
        qb.andWhere('apt.doctorId = :myDoctorId', { myDoctorId });
      }
    }

    if (status) qb.andWhere('apt.status = :status', { status });
    if (dateFrom) qb.andWhere('apt.appointmentDate >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('apt.appointmentDate <= :dateTo', { dateTo });

    qb.orderBy('apt.appointmentDate', order)
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const result = { data: items, total, page, limit };

    await this.cacheManager.set(cacheKey, result, 300);
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    if (!keys.includes(cacheKey)) {
      keys.push(cacheKey);
      await this.cacheManager.set(listKey, keys);
    }

    return result;
  }

  /**
   * Obtener agenda de citas de un médico por rango de fechas.
   * IDOR: si el usuario es doctor, solo puede ver su propia agenda.
   */
  async getDoctorSchedule(doctorId: string, query: QueryMedicalAppointmentDto, authUser?: any) {
    const { page, limit, order, status, dateFrom, dateTo } = query;

    // IDOR: si el usuario es doctor, forzar su propio doctorId
    let effectiveDoctorId = doctorId;
    if (authUser?.id) {
      const myDoctorId = await this.getDoctorIdForUser(authUser.id);
      if (myDoctorId && myDoctorId !== doctorId) {
        throw new ForbiddenException('Solo puede consultar su propia agenda.');
      }
    }

    const doctor = await this.doctorRepository.findOne({
      where: { id: effectiveDoctorId, deletedAt: IsNull() },
    });
    if (!doctor) {
      throw new NotFoundException(`Médico con ID ${doctorId} no encontrado.`);
    }

    const cacheKey = `appointment:doctor:${doctorId}:${JSON.stringify(query)}`;
    const listKey = 'appointment:query:keys';
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const qb = this.appointmentRepository
      .createQueryBuilder('apt')
      .leftJoinAndSelect('apt.patient', 'patient')
      .leftJoinAndSelect('patient.commonPerson', 'patientPerson')
      .leftJoinAndSelect('apt.specialty', 'specialty')
      .leftJoinAndSelect('apt.medicalCenter', 'medicalCenter')
      .where('apt.doctorId = :doctorId', { doctorId })
      .andWhere('apt.deletedAt IS NULL');

    if (status) qb.andWhere('apt.status = :status', { status });
    if (dateFrom) qb.andWhere('apt.appointmentDate >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('apt.appointmentDate <= :dateTo', { dateTo });

    qb.orderBy('apt.appointmentDate', order)
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const result = { data: items, total, page, limit };

    await this.cacheManager.set(cacheKey, result, 300);
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    if (!keys.includes(cacheKey)) {
      keys.push(cacheKey);
      await this.cacheManager.set(listKey, keys);
    }

    return result;
  }

  /**
   * Verificar slots disponibles del médico en un día
   * Retorna los horarios ya ocupados, el horario del doctor y si el día está disponible
   */
  async checkAvailability(
    doctorId: string,
    date: string,
    medicalCenterId?: string,
  ): Promise<{
    occupiedSlots: { start: Date; end: Date; appointmentNumber: string }[];
    schedule: { startTime: string; endTime: string; maxDailyAppointments: number }[];
    currentCount: number;
    available: boolean;
  }> {
    const doctor = await this.doctorRepository.findOne({
      where: { id: doctorId, deletedAt: IsNull() },
    });
    if (!doctor) {
      throw new NotFoundException(`Médico con ID ${doctorId} no encontrado.`);
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const dayOfWeek = dayStart.getDay();

    // Obtener horarios del doctor para ese día
    let schedule: { startTime: string; endTime: string; maxDailyAppointments: number }[] = [];
    if (medicalCenterId) {
      const blocks = await this.scheduleService.getScheduleForDoctorOnDay(
        doctorId,
        medicalCenterId,
        dayOfWeek,
      );
      schedule = blocks.map((b) => ({
        startTime: b.startTime,
        endTime: b.endTime,
        maxDailyAppointments: b.maxDailyAppointments,
      }));
    }

    const qb = this.appointmentRepository
      .createQueryBuilder('apt')
      .where('apt.doctorId = :doctorId', { doctorId })
      .andWhere('apt.deletedAt IS NULL')
      .andWhere('apt.status NOT IN (:...statuses)', {
        statuses: [AppointmentStatus.CANCELLED],
      })
      .andWhere('apt.appointmentDate BETWEEN :dayStart AND :dayEnd', {
        dayStart,
        dayEnd,
      });

    if (medicalCenterId) {
      qb.andWhere('apt.medicalCenterId = :medicalCenterId', { medicalCenterId });
    }

    const appointments = await qb.orderBy('apt.appointmentDate', 'ASC').getMany();

    const occupiedSlots = appointments.map((apt) => ({
      start: apt.appointmentDate,
      end: new Date(
        apt.appointmentDate.getTime() + apt.durationMinutes * 60 * 1000,
      ),
      appointmentNumber: apt.appointmentNumber,
    }));

    const currentCount = appointments.length;
    const maxDaily = schedule.length > 0 ? schedule[0].maxDailyAppointments : 20;
    const available = schedule.length > 0 && currentCount < maxDaily;

    return { occupiedSlots, schedule, currentCount, available };
  }

  /**
   * Obtener los días disponibles de un doctor en un rango de fechas.
   * Retorna un array de fechas donde el doctor tiene horario y cupos.
   */
  async getAvailableDates(
    doctorId: string,
    medicalCenterId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ date: string; dayOfWeek: number; slotsAvailable: number }[]> {
    const doctor = await this.doctorRepository.findOne({
      where: { id: doctorId, deletedAt: IsNull() },
    });
    if (!doctor) {
      throw new NotFoundException(`Médico con ID ${doctorId} no encontrado.`);
    }

    // Obtener todos los horarios del doctor en ese centro
    const schedules = await this.scheduleService.getSchedulesByDoctor(
      doctorId,
      medicalCenterId,
    );

    // Mapear los días que tiene disponible
    const scheduledDays = new Map<number, { maxDailyAppointments: number }>();
    for (const sc of schedules) {
      scheduledDays.set(sc.dayOfWeek, {
        maxDailyAppointments: sc.maxDailyAppointments,
      });
    }

    const result: { date: string; dayOfWeek: number; slotsAvailable: number }[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      const config = scheduledDays.get(dayOfWeek);

      if (config) {
        // Contar citas existentes para ese día
        const dayStart = new Date(current);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(current);
        dayEnd.setHours(23, 59, 59, 999);

        const count = await this.appointmentRepository
          .createQueryBuilder('apt')
          .where('apt.doctorId = :doctorId', { doctorId })
          .andWhere('apt.medicalCenterId = :medicalCenterId', { medicalCenterId })
          .andWhere('apt.deletedAt IS NULL')
          .andWhere('apt.status NOT IN (:...statuses)', {
            statuses: [AppointmentStatus.CANCELLED],
          })
          .andWhere('apt.appointmentDate BETWEEN :dayStart AND :dayEnd', {
            dayStart,
            dayEnd,
          })
          .getCount();

        const slotsAvailable = config.maxDailyAppointments - count;
        if (slotsAvailable > 0) {
          result.push({
            date: current.toISOString().split('T')[0],
            dayOfWeek,
            slotsAvailable,
          });
        }
      }

      current.setDate(current.getDate() + 1);
    }

    return result;
  }
}
