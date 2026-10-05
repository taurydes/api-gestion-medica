import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
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
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import {
  AppointmentStatus,
  AppointmentType,
  MedicalAppointment,
} from './entities/medical-appointment.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import {
  atMinutes,
  dailyCap,
  dateToMinutes,
  fitsInBlock,
  minutesToTime,
  slotsCovering,
  timeToMinutes,
  formatLocalDate,
  parseLocalDate,
} from 'src/doctors/schedule-time.util';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { personDocumentWhere } from 'src/common-person/person-document.util';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Department } from 'src/departments/entities/department.entity';
import { CreateMedicalAppointmentDto } from './dto/create-medical-appointment.dto';
import { UpdateMedicalAppointmentDto } from './dto/update-medical-appointment.dto';
import { QueryMedicalAppointmentDto } from './dto/query-medical-appointment.dto';
import {
  AppointmentDetailDto,
  AppointmentListItemDto,
  AppointmentPaginatedResponseDto,
  mapToDetail,
  mapToListItem,
} from './dto/appointment-response.dto';
import { Allergy } from 'src/parameters/entities/allergy.entity';
import { ChronicDisease } from 'src/parameters/entities/chronic-disease.entity';
import { Medication } from 'src/parameters/entities/medication.entity';
import { MedicalHistoryService } from 'src/medical-history/medical-history.service';
import { RecipeService } from 'src/recipe/recipe.service';
import { CompleteConsultationDto } from './dto/complete-consultation.dto';
import { User } from 'src/user/entities/user.entity';
import { DoctorScheduleService } from 'src/doctors/doctor-schedule.service';
import { FilesService } from 'src/files/files.service';
import { toHttpException } from 'src/common/exceptions/to-http-exception';
import { EmailService } from 'src/email/email.service';

/** Outcome of `notifyPatient` in the finish-consultation response. */
export type ConsultationNotification = { jobId: string } | { error: string };
export const NOTIFICATION_FAILED = 'No se pudo encolar el correo al paciente.';

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
    private readonly filesService: FilesService,

    private readonly authContextService: AuthContextService,

    @InjectDataSource(DatabaseConnectionName.DB_MAIN)
    private readonly dataSource: DataSource,

    // Optional so the specs that build this service by hand still compile
    @Optional()
    private readonly emailService?: EmailService,
  ) {}

  private readonly logger = new Logger(MedicalAppointmentsService.name);

  // ─── IDOR helper ───────────────────────────────────────────────────────────

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
   * Resuelve el patientId vinculado al usuario autenticado.
   * Retorna null si el usuario no tiene perfil de paciente.
   */
  private async getPatientIdForUser(userId: string): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['commonPerson'],
    });
    if (!user?.commonPerson) return null;

    const patient = await this.patientRepository.findOne({
      where: { commonPersonId: user.commonPerson.id },
    });
    return patient?.id ?? null;
  }

  /**
   * Verifica si el usuario tiene rol de administrador.
   * Los admins no están sujetos a restricciones IDOR aunque tengan perfil de doctor.
   */
  /** Writes follow the read rule: a doctor acts only on their own appointments (MJ-27). */
  private async assertWriteAccess(
    apt: { doctorId: string },
    userId?: string,
    message = 'Solo el médico asignado puede modificar esta cita.',
  ): Promise<void> {
    if (!userId) return;
    await this.authContextService.assertDoctorScope(userId, apt.doctorId, message);
  }

  private async isAdminUser(userId: string): Promise<boolean> {
    // Por permiso del rol, no por subcadena del nombre ("Administrativo" no queda exento)
    return this.authContextService.isAdmin(userId);
  }

  // ─── Cache helpers ─────────────────────────────────────────────────────────

  private async clearQueryCache(): Promise<void> {
    await invalidateScope(this.cacheManager, APPOINTMENT_CACHE_SCOPE);
  }

  // ─── Image enrichment ──────────────────────────────────────────────────────

  private async enrichWithImages(apt: any): Promise<any> {
    const [patientImageUrl, doctorImageUrl] = await Promise.all([
      apt.patient?.commonPersonId
        ? this.filesService.getLatestCommonPersonImageUrl(apt.patient.commonPersonId)
        : Promise.resolve(null),
      apt.doctor?.id
        ? this.filesService.getLatestDoctorImageUrl(apt.doctor.id)
        : Promise.resolve(null),
    ]);
    return {
      ...apt,
      patient: apt.patient ? { ...apt.patient, imageUrl: patientImageUrl } : null,
      doctor: apt.doctor ? { ...apt.doctor, imageUrl: doctorImageUrl } : null,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Busca o crea un paciente según documentNumber o patientId
   */
  private async resolvePatient(
    dto: CreateMedicalAppointmentDto,
    userId?: string,
    manager?: EntityManager,
  ): Promise<Patient> {
    // Inside create's transaction a failed appointment rolls the new person and patient back (MJ-25).
    const patientRepository = manager ? manager.getRepository(Patient) : this.patientRepository;
    const commonPersonRepository = manager ? manager.getRepository(CommonPerson) : this.commonPersonRepository;
    // Si se proporcionó patientId, buscar directamente
    if (dto.patientId) {
      const patient = await patientRepository.findOne({
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

    let commonPerson = await commonPersonRepository.findOne({
      where: personDocumentWhere(dto.documentLetter, dto.documentNumber),
    });

    // Crear CommonPerson si no existe
    if (!commonPerson) {
      if (!dto.newPatientData?.commonPerson) {
        throw new BadRequestException(
          `No se encontró ninguna persona con documento ${dto.documentLetter ?? ''}${dto.documentNumber}. Proporcione newPatientData para registrarla.`,
        );
      }
      commonPerson = commonPersonRepository.create({
        ...dto.newPatientData.commonPerson,
        documentNumber: dto.documentNumber,
        letter: dto.documentLetter ?? null,
      });
      commonPerson = await commonPersonRepository.save(commonPerson);
    }

    // Verificar si ya existe un paciente con este commonPersonId
    let patient = await patientRepository.findOne({
      where: { commonPersonId: commonPerson.id, deletedAt: IsNull() },
      relations: ['commonPerson'],
    });

    if (!patient) {
      // Generar código de paciente
      const patientCode = await nextCode(patientRepository, 'PAC');

      const newPatient = patientRepository.create({
        commonPersonId: commonPerson.id,
        commonPerson,
        patientCode,
        email: dto.newPatientData?.email ?? null,
      });
      // Set audit field separately to avoid DeepPartial type conflict with null
      (newPatient as any).createdBy = userId ?? null;
      const savedPatient = await patientRepository.save(newPatient);

      // Recargar con relaciones
      const reloaded = await patientRepository.findOne({
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

  /** Rejects a time that overlaps another active appointment of the same patient. */
  private async checkPatientConflict(
    patientId: string,
    appointmentDate: Date,
    durationMinutes: number,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.appointmentRepository
      .createQueryBuilder('apt')
      .where('apt.patientId = :patientId', { patientId })
      .andWhere('apt.deletedAt IS NULL')
      .andWhere('apt.status NOT IN (:...statuses)', {
        statuses: [AppointmentStatus.CANCELLED],
      })
      .andWhere(
        "apt.appointmentDate < :endTime AND (apt.appointmentDate + (apt.durationMinutes * interval '1 minute')) > :startTime",
        {
          startTime: appointmentDate,
          endTime: new Date(appointmentDate.getTime() + durationMinutes * 60 * 1000),
        },
      );
    if (excludeId) qb.andWhere('apt.id != :excludeId', { excludeId });

    const conflict = await qb.getOne();
    if (conflict) {
      throw new BadRequestException(
        `El paciente ya tiene una cita programada en ese horario (Cita #${conflict.appointmentNumber}).`,
      );
    }
  }

  /** 404 for a missing doctor, 400 when the doctor is not assigned to the center (MJ-24). */
  private async assertDoctorInCenter(doctorId: string, medicalCenterId: string): Promise<void> {
    const doctor = await this.doctorRepository.findOne({
      where: { id: doctorId, deletedAt: IsNull() },
      relations: ['medicalCenters'],
    });
    if (!doctor) {
      throw new NotFoundException(`Médico con ID ${doctorId} no encontrado.`);
    }
    if (!doctor.medicalCenters?.some((mc) => mc.id === medicalCenterId && !mc.deletedAt)) {
      throw new BadRequestException('El médico no está asignado a este centro médico.');
    }
  }

  /**
   * Every booking rule that depends on doctor, center and time; shared by create and reschedule.
   * Runs inside the caller's transaction: the capacity counts happen under the doctor/day lock.
   */
  private async validateBooking(
    manager: EntityManager,
    doctorId: string,
    medicalCenterId: string,
    appointmentDate: Date,
    durationMinutes: number,
    excludeId?: string,
  ): Promise<void> {
    await this.assertDoctorInCenter(doctorId, medicalCenterId);
    await this.validateDoctorSchedule(doctorId, medicalCenterId, appointmentDate, durationMinutes);
    await this.lockDoctorDay(manager, doctorId, appointmentDate);
    await this.validateSlotCapacity(manager, doctorId, medicalCenterId, appointmentDate, durationMinutes, excludeId);
    await this.validateDailyAppointmentLimit(manager, doctorId, medicalCenterId, appointmentDate, excludeId);
  }

  /**
   * Serializes the bookings of one doctor on one calendar day (RN-06b): concurrent requests queue here,
   * so count-then-insert sees the rows committed by the previous holder. Released with the transaction.
   */
  private async lockDoctorDay(manager: EntityManager, doctorId: string, appointmentDate: Date): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${doctorId}:${formatLocalDate(appointmentDate)}`,
    ]);
  }

  /**
   * Valida que el doctor tenga horario configurado el día de la cita
   * en el centro médico indicado.
   */
  private async validateDoctorSchedule(
    doctorId: string,
    medicalCenterId: string,
    appointmentDate: Date,
    durationMinutes = 30,
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

    // Minutes, not text: 'HH:mm' >= 'HH:mm:ss' is false as strings and rejected the block's first slot.
    const appointmentTime = appointmentDate.toTimeString().slice(0, 5); // HH:mm, for the message
    const startMinutes = dateToMinutes(appointmentDate);
    const inBlock = schedules.some((s) => fitsInBlock(s, startMinutes, durationMinutes));
    if (!inBlock) {
      throw new BadRequestException(
        `La hora ${appointmentTime} no está dentro del horario del doctor en este centro médico.`,
      );
    }
  }

  /**
   * Slot rule (MJ-19): each slot of the block admits maxPatientsPerSlot overlapping appointments; an
   * overlapping appointment in another center is a double booking (the doctor cannot be in two places).
   */
  private async validateSlotCapacity(
    manager: EntityManager,
    doctorId: string,
    medicalCenterId: string,
    appointmentDate: Date,
    durationMinutes: number,
    excludeId?: string,
  ): Promise<void> {
    const startMinutes = dateToMinutes(appointmentDate);
    const blocks = await this.scheduleService.getScheduleForDoctorOnDay(
      doctorId,
      medicalCenterId,
      appointmentDate.getDay(),
    );
    const block = blocks.find((b) => fitsInBlock(b, startMinutes, durationMinutes));
    if (!block) return; // validateDoctorSchedule already rejected it

    const endTime = new Date(appointmentDate.getTime() + durationMinutes * 60_000);
    const slots = slotsCovering(block, startMinutes, durationMinutes);
    // Window = the covered slots (wider than the appointment when slots are longer than it)
    const windowStart = atMinutes(appointmentDate, Math.min(slots[0].start, startMinutes));
    const windowEnd = new Date(Math.max(atMinutes(appointmentDate, slots[slots.length - 1].end).getTime(), endTime.getTime()));
    // The transaction's own connection: it holds the doctor/day lock the count relies on.
    const qb = manager
      .getRepository(MedicalAppointment)
      .createQueryBuilder('apt')
      .where('apt.doctorId = :doctorId', { doctorId })
      .andWhere('apt.deletedAt IS NULL')
      .andWhere('apt.status NOT IN (:...statuses)', { statuses: [AppointmentStatus.CANCELLED] })
      .andWhere(
        "apt.appointmentDate < :endTime AND (apt.appointmentDate + (apt.durationMinutes * interval '1 minute')) > :startTime",
        { startTime: windowStart, endTime: windowEnd },
      );
    if (excludeId) qb.andWhere('apt.id != :excludeId', { excludeId });
    const nearby = await qb.getMany();
    const overlaps = (a: { appointmentDate: Date; durationMinutes: number }, from: Date, to: Date) => {
      const aStart = new Date(a.appointmentDate);
      return aStart < to && new Date(aStart.getTime() + a.durationMinutes * 60_000) > from;
    };

    const elsewhere = nearby.find(
      (a) => a.medicalCenterId !== medicalCenterId && overlaps(a, appointmentDate, endTime),
    );
    if (elsewhere) {
      throw new BadRequestException(
        `El médico ya tiene una cita programada que se solapa con el horario solicitado (Cita #${elsewhere.appointmentNumber}).`,
      );
    }

    const capacity = block.maxPatientsPerSlot || 1;
    for (const slot of slots) {
      const slotStart = atMinutes(appointmentDate, slot.start);
      const slotEnd = atMinutes(appointmentDate, slot.end);
      const taken = nearby.filter(
        (a) => a.medicalCenterId === medicalCenterId && overlaps(a, slotStart, slotEnd),
      ).length;
      if (taken >= capacity) {
        throw new BadRequestException(
          `El turno de las ${minutesToTime(slot.start)} ya está completo: admite ${capacity} paciente(s) y tiene ${taken}.`,
        );
      }
    }
  }

  /** Every slot of the day's blocks with its capacity and the active appointments that overlap it. */
  private slotGrid(
    day: Date,
    blocks: Array<{ startTime: string; endTime: string; slotDurationMinutes?: number; maxPatientsPerSlot?: number }>,
    appointments: Array<{ appointmentDate: Date; durationMinutes: number }>,
  ): { start: Date; end: Date; capacity: number; booked: number; available: boolean }[] {
    const grid: { start: Date; end: Date; capacity: number; booked: number; available: boolean }[] = [];
    for (const block of blocks) {
      const from = timeToMinutes(block.startTime);
      const length = timeToMinutes(block.endTime) - from;
      for (const slot of slotsCovering(block, from, length)) {
        const start = atMinutes(day, slot.start);
        const end = atMinutes(day, slot.end);
        const capacity = block.maxPatientsPerSlot || 1;
        const booked = appointments.filter((a) => {
          const aStart = new Date(a.appointmentDate);
          return aStart < end && new Date(aStart.getTime() + a.durationMinutes * 60_000) > start;
        }).length;
        grid.push({ start, end, capacity, booked, available: booked < capacity });
      }
    }
    return grid.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  /**
   * Valida que el doctor no haya superado el máximo de citas diarias
   * configurado en su horario para ese centro médico.
   */
  private async validateDailyAppointmentLimit(
    manager: EntityManager,
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

    const maxDaily = dailyCap(schedules);

    // Contar citas activas del doctor ese día en ese centro
    const dayStart = new Date(appointmentDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(appointmentDate);
    dayEnd.setHours(23, 59, 59, 999);

    const qb = manager
      .getRepository(MedicalAppointment)
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
      .leftJoinAndSelect('apt.appointmentFiles', 'appointmentFiles')
      
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
      // A doctor books only in their own name; checked before the patient can be created (MJ-27).
      await this.assertWriteAccess({ doctorId: dto.doctorId }, userId, 'Un médico solo puede agendar citas a su nombre.');

      const appointmentDate = new Date(dto.appointmentDate);

      // Validar que la fecha no sea en el pasado
      if (appointmentDate <= new Date()) {
        throw new BadRequestException(
          'La fecha de la cita no puede ser en el pasado.',
        );
      }

      const duration = dto.durationMinutes ?? 30;

      // Every check that does not need the patient runs before anything is written (MJ-25).
      if (!dto.medicalCenterId) {
        throw new BadRequestException('Indique el centro médico de la cita.');
      }
      const center = await this.medicalCenterRepository.findOne({
        where: { id: dto.medicalCenterId, deletedAt: IsNull() },
      });
      if (!center) {
        throw new NotFoundException(
          `Centro médico con ID ${dto.medicalCenterId} no encontrado.`,
        );
      }

      if (dto.specialtyId) {
        const specialty = await this.specialtyRepository.findOne({
          where: { id: dto.specialtyId, deletedAt: IsNull() },
        });
        if (!specialty) {
          throw new NotFoundException(
            `Especialidad con ID ${dto.specialtyId} no encontrada.`,
          );
        }
      }

      if (dto.departmentId) {
        const dept = await this.departmentRepository.findOne({
          where: { id: dto.departmentId, deletedAt: IsNull() },
        });
        if (!dept) {
          throw new NotFoundException(
            `Departamento con ID ${dto.departmentId} no encontrado.`,
          );
        }
      }

      // Patient (found or created) and appointment commit together: a failure leaves no orphan patient.
      const saved = await this.dataSource.transaction(async (manager) => {
        // Schedule and capacity under the doctor/day lock, before the patient step writes anything.
        await this.validateBooking(manager, dto.doctorId, dto.medicalCenterId, appointmentDate, duration);
        const patient = await this.resolvePatient(dto, userId, manager);
        await this.checkPatientConflict(patient.id, appointmentDate, duration);

        const aptRepo = manager.getRepository(MedicalAppointment);
        const appointmentNumber = await nextCode(aptRepo, 'APT');
        return aptRepo.save(
          aptRepo.create({
            appointmentNumber,
            appointmentDate,
            durationMinutes: duration,
            status: dto.status ?? AppointmentStatus.PENDING,
            type: dto.type ?? AppointmentType.FIRST_VISIT,
            reason: dto.reason,
            observations: dto.observations ?? null,
            patientId: patient.id,
            doctorId: dto.doctorId,
            specialtyId: dto.specialtyId ?? null,
            medicalCenterId: dto.medicalCenterId,
            departmentId: dto.departmentId ?? null,
            createdBy: userId ?? null,
          }),
        );
      });

      await this.clearQueryCache();

      return this.loadFullAppointment(saved.id);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        throw error;
      throw toHttpException(error, 'Error al crear la cita médica.');
    }
  }

  /**
   * Listar citas con filtros y paginación.
   * IDOR:
   *  - Usuario con rol paciente → solo ve sus propias citas (filtro por patientId).
   *  - Usuario con rol doctor   → solo ve las citas asignadas a él (filtro por doctorId).
   *  - Admin / enfermero / recepcionista → ve todas.
   */
  async findAll(
    query: QueryMedicalAppointmentDto,
    authUser?: any,
  ): Promise<AppointmentPaginatedResponseDto> {
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

    // ── IDOR ──────────────────────────────────────────────────────────────────
    let effectiveDoctorId = doctorId;
    let effectivePatientId = patientId;

    if (authUser?.id) {
      const isAdmin = await this.isAdminUser(authUser.id);

      if (!isAdmin) {
        // Caso doctor: forzar su propio doctorId
        const myDoctorId = await this.authContextService.getDoctorIdForUser(authUser.id);
        if (myDoctorId) {
          effectiveDoctorId = myDoctorId;
          // Si pidió un centro médico, validar que le pertenezca
          const myCenterIds = await this.getMedicalCenterIdsForUser(authUser.id);
          if (myCenterIds?.length && medicalCenterId && !myCenterIds.includes(medicalCenterId)) {
            throw new ForbiddenException('No tiene acceso a este centro médico.');
          }
        } else {
          // Caso paciente: forzar su propio patientId
          const myPatientId = await this.getPatientIdForUser(authUser.id);
          if (myPatientId) {
            effectivePatientId = myPatientId;
          }
        }
      }
    }

    const cacheKey = `appointment:query:${JSON.stringify({ ...query, effectiveDoctorId, effectivePatientId })}`;

    const cached = await getScoped<AppointmentPaginatedResponseDto>(this.cacheManager, APPOINTMENT_CACHE_SCOPE, cacheKey);
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

    if (effectivePatientId) qb.andWhere('apt.patientId = :patientId', { patientId: effectivePatientId });
    if (effectiveDoctorId) qb.andWhere('apt.doctorId = :doctorId', { doctorId: effectiveDoctorId });
    if (specialtyId) qb.andWhere('apt.specialtyId = :specialtyId', { specialtyId });
    if (medicalCenterId) qb.andWhere('apt.medicalCenterId = :medicalCenterId', { medicalCenterId });
    if (departmentId) qb.andWhere('apt.departmentId = :departmentId', { departmentId });
    if (status) qb.andWhere('apt.status = :status', { status });
    if (type) qb.andWhere('apt.type = :type', { type });
    if (dateFrom) qb.andWhere('apt.appointmentDate >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('apt.appointmentDate <= :dateTo', { dateTo });

    qb.orderBy('apt.appointmentDate', order)
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    const enriched = await Promise.all(items.map((apt) => this.enrichWithImages(apt)));
    const result: AppointmentPaginatedResponseDto = {
      data: enriched.map(mapToListItem),
      total,
      page,
      limit,
    };

    await setScoped(this.cacheManager, APPOINTMENT_CACHE_SCOPE, cacheKey, result, CACHE_TTL.LIST);

    return result;
  }

  /**
   * Obtener una cita por ID con todas sus relaciones.
   * IDOR:
   *  - Usuario con rol paciente → solo puede ver sus propias citas (403 si no le pertenece).
   *  - Usuario con rol doctor   → solo puede ver las citas asignadas a él.
   *  - Admin / enfermero / recepcionista → puede ver cualquier cita.
   *
   * Retorna AppointmentDetailDto con los files integrados, sin campos de auditoría
   * ni datos sensibles internos.
   */
  async findOne(id: string, authUser?: any): Promise<AppointmentDetailDto> {
    const cacheKey = `appointment:detail:${id}`;
    const cached = await getScoped<AppointmentDetailDto>(this.cacheManager, APPOINTMENT_CACHE_SCOPE, cacheKey);
    if (cached) {
      // Aplicar validación IDOR sobre el caché antes de devolver
      await this.assertFindOneAccess(cached, authUser);
      return cached;
    }

    const apt = await this.loadFullAppointment(id);

    // IDOR sobre entidad cruda (tiene doctorId y patientId como propiedades)
    await this.assertFindOneAccess(apt, authUser);

    const enriched = await this.enrichWithImages(apt);
    const dto = mapToDetail(enriched);

    // Registered with the lists so patient, doctor, history and recipe writes can drop it too
    await setScoped(this.cacheManager, APPOINTMENT_CACHE_SCOPE, cacheKey, dto, CACHE_TTL.DETAIL);
    return dto;
  }

  /**
   * Valida el acceso IDOR para findOne.
   * Acepta tanto la entidad cruda (MedicalAppointment) como el DTO cacheado
   * (AppointmentDetailDto), ya que ambos exponen patientId / doctorId o
   * patient.id / doctor.id respectivamente.
   */
  private async assertFindOneAccess(aptOrDto: any, authUser?: any): Promise<void> {
    if (!authUser?.id) return;

    const isAdmin = await this.isAdminUser(authUser.id);
    if (isAdmin) return;

    // Obtener IDs de la entidad cruda (doctorId / patientId) o del DTO (doctor.id / patient.id)
    const aptDoctorId: string = aptOrDto.doctorId ?? aptOrDto.doctor?.id;
    const aptPatientId: string = aptOrDto.patientId ?? aptOrDto.patient?.id;

    // Validar acceso de doctor
    const myDoctorId = await this.authContextService.getDoctorIdForUser(authUser.id);
    if (myDoctorId) {
      if (aptDoctorId !== myDoctorId) {
        throw new ForbiddenException('No tiene acceso a esta cita médica.');
      }
      return;
    }

    // Validar acceso de paciente
    const myPatientId = await this.getPatientIdForUser(authUser.id);
    if (myPatientId) {
      if (aptPatientId !== myPatientId) {
        throw new ForbiddenException('No tiene acceso a esta cita médica.');
      }
      return;
    }

    // Enfermeros / recepcionistas sin perfil de doctor ni paciente → acceso permitido
  }

  /**
   * Actualizar una cita médica
   */
  async update(
    id: string,
    dto: UpdateMedicalAppointmentDto,
    userId?: string,
  ): Promise<MedicalAppointment> {
    const apt = await this.appointmentRepository.findOne({ where: { id, deletedAt: IsNull() } });

    if (!apt) {
      throw new NotFoundException(`Cita médica con ID ${id} no encontrada.`);
    }

    await this.assertWriteAccess(apt, userId);
    if (dto.doctorId && dto.doctorId !== apt.doctorId) {
      await this.assertWriteAccess({ doctorId: dto.doctorId }, userId);
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

    // Any change to when, who or where re-runs the same checks as create, on the resulting values.
    const reschedules =
      dto.appointmentDate !== undefined ||
      dto.doctorId !== undefined ||
      dto.medicalCenterId !== undefined ||
      dto.durationMinutes !== undefined;
    const newDate = dto.appointmentDate ? new Date(dto.appointmentDate) : apt.appointmentDate;
    const doctorId = dto.doctorId ?? apt.doctorId;
    const medicalCenterId = dto.medicalCenterId ?? apt.medicalCenterId;
    const duration = dto.durationMinutes ?? apt.durationMinutes;
    if (reschedules) {
      if (dto.appointmentDate && newDate <= new Date()) {
        throw new BadRequestException(
          'La fecha de la cita no puede ser en el pasado.',
        );
      }
      if (!medicalCenterId) {
        throw new BadRequestException('Indique el centro médico de la cita para reprogramarla.');
      }
      // Same order as create: an unknown center is 404 before "not assigned to this center" (400).
      if (dto.medicalCenterId) {
        const center = await this.medicalCenterRepository.findOne({
          where: { id: dto.medicalCenterId, deletedAt: IsNull() },
        });
        if (!center) {
          throw new NotFoundException(`Centro médico con ID ${dto.medicalCenterId} no encontrado.`);
        }
      }
      await this.checkPatientConflict(apt.patientId, newDate, duration, id);
    }

    const {
      patientId: _p,
      documentNumber: _d,
      documentLetter: _l,
      newPatientData: _n,
      appointmentDate: _a,
      ...rest
    } = dto;

    // The reschedule is validated and saved under the doctor/day lock, like a new booking.
    await this.dataSource.transaction(async (manager) => {
      if (reschedules) {
        await this.validateBooking(manager, doctorId, medicalCenterId!, newDate, duration, id);
        apt.appointmentDate = newDate;
      }
      Object.assign(apt, { ...rest, updatedBy: userId ?? null });
      await manager.getRepository(MedicalAppointment).save(apt);
    });

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
    const apt = await this.appointmentRepository.findOne({ where: { id, deletedAt: IsNull() } });

    if (!apt) {
      throw new NotFoundException(`Cita médica con ID ${id} no encontrada.`);
    }

    await this.assertWriteAccess(apt, userId);

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

    await this.clearQueryCache();

    return this.loadFullAppointment(id);
  }

  /** Confirms the patient's arrival: only a pending appointment can be confirmed. */
  async confirm(id: string, userId?: string): Promise<MedicalAppointment> {
    return this.transition(
      id,
      AppointmentStatus.PENDING,
      AppointmentStatus.CONFIRMED,
      'Solo se puede confirmar una cita programada.',
      userId,
    );
  }

  /** Opens the consultation: only a confirmed appointment can start it. */
  async startConsultation(id: string, userId?: string): Promise<MedicalAppointment> {
    return this.transition(
      id,
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.IN_CONSULTATION,
      'Solo se puede iniciar la consulta de una cita confirmada.',
      userId,
    );
  }

  private async transition(
    id: string,
    from: AppointmentStatus,
    to: AppointmentStatus,
    message: string,
    userId?: string,
  ): Promise<MedicalAppointment> {
    const apt = await this.appointmentRepository.findOne({ where: { id, deletedAt: IsNull() } });

    if (!apt) {
      throw new NotFoundException(`Cita médica con ID ${id} no encontrada.`);
    }

    await this.assertWriteAccess(apt, userId);

    if (apt.status !== from) {
      throw new BadRequestException(message);
    }

    apt.status = to;
    apt.updatedBy = userId ?? null;

    await this.appointmentRepository.save(apt);

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
  ): Promise<MedicalAppointment & { notification?: ConsultationNotification }> {
    // Validate catalog references before opening the transaction, so a bad medicationId writes nothing.
    if (dto.recipe) {
      await this.recipeService.assertMedicationsExist(dto.recipe.items);
    }

    // All three writes commit together; a failure rolls back the history so a retry can succeed.
    const scope = await this.dataSource.transaction(async (manager) => {
      const aptRepo = manager.getRepository(MedicalAppointment);
      const apt = await aptRepo.findOne({
        where: { id, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });

      if (!apt) {
        throw new NotFoundException(`Cita médica con ID ${id} no encontrada.`);
      }

      await this.assertWriteAccess(apt, userId);

      if (apt.status === AppointmentStatus.COMPLETED) {
        throw new BadRequestException('La cita ya está completada.');
      }

      if (apt.status === AppointmentStatus.CANCELLED) {
        throw new BadRequestException('No se puede finalizar una cita cancelada.');
      }

      if (apt.status === AppointmentStatus.PENDING) {
        throw new BadRequestException(
          'Solo se puede finalizar la consulta de una cita confirmada o en consulta.',
        );
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

      // Closing the consultation closes its record too (MJ-50).
      const history = await this.historyService.create(historyDto, userId, manager, 'completed');

      // 2️⃣ Crear Receta si se proporciona
      if (dto.recipe) {
        const recipeDto = {
          ...dto.recipe,
          medicalHistoryId: history.id,
          medicalAppointmentId: id,
          patientId: apt.patientId,
          doctorId: apt.doctorId,
        };
        await this.recipeService.create(recipeDto as any, userId, manager);
      }

      // 3️⃣ Marcar cita como completada
      apt.status = AppointmentStatus.COMPLETED;
      if (dto.observations) apt.observations = dto.observations;
      apt.updatedBy = userId ?? null;

      await aptRepo.save(apt);

      return { patientId: apt.patientId, medicalHistoryId: history.id, hasRecipe: !!dto.recipe };
    });

    // Limpiar caches (solo después del commit)
    await this.historyService.invalidateListCache();
    if (scope.hasRecipe) await this.recipeService.invalidateCaches(scope);
    await this.clearQueryCache();

    // After the commit and never fatal: the consultation is closed whether or not the email can be queued.
    const notification = dto.notifyPatient ? await this.notifyPatient(id, userId) : undefined;

    const appointment = await this.loadFullAppointment(id);
    return notification ? { ...appointment, notification } : appointment;
  }

  /** Never throws: the consultation is already committed, so a failure becomes `{ error }` in the response. */
  private async notifyPatient(appointmentId: string, userId?: string): Promise<ConsultationNotification> {
    try {
      if (!this.emailService || !userId) return { error: NOTIFICATION_FAILED };
      const { jobId } = await this.emailService.enqueueAppointmentSummary(appointmentId, undefined, userId);
      this.logger.log(`Resumen de la cita ${appointmentId} encolado (${jobId}).`);
      return { jobId };
    } catch (error) {
      this.logger.warn(`No se encoló el resumen de la cita ${appointmentId}: ${(error as Error)?.message}`);
      // Domain messages (no email, mail off, 403) are safe to show; anything else stays in the log.
      return { error: error instanceof HttpException ? error.message : NOTIFICATION_FAILED };
    }
  }

  /** POST /medical-appointments/:id/email-summary: same checks as notifyPatient, but errors reach the client. */
  async emailSummary(appointmentId: string, to: string | undefined, userId: string): Promise<{ jobId: string }> {
    if (!this.emailService) throw new Error('EmailService no está disponible.');
    return this.emailService.enqueueAppointmentSummary(appointmentId, to, userId);
  }

  /**
   * Soft-delete de una cita
   */
  async remove(id: string, userId?: string): Promise<void> {
    const apt = await this.appointmentRepository.findOne({ where: { id, deletedAt: IsNull() } });

    if (!apt) {
      throw new NotFoundException(`Cita médica con ID ${id} no encontrada.`);
    }

    await this.assertWriteAccess(apt, userId);

    apt.deletedAt = new Date();
    apt.isActive = false;
    apt.updatedBy = userId ?? null;
    await this.appointmentRepository.save(apt);

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
    const cached = await getScoped(this.cacheManager, APPOINTMENT_CACHE_SCOPE, cacheKey);
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
      const myDoctorId = await this.authContextService.getScopedDoctorId(authUser.id);
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

    await setScoped(this.cacheManager, APPOINTMENT_CACHE_SCOPE, cacheKey, result, CACHE_TTL.LIST);

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
      const myDoctorId = await this.authContextService.getScopedDoctorId(authUser.id);
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
    const cached = await getScoped(this.cacheManager, APPOINTMENT_CACHE_SCOPE, cacheKey);
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

    await setScoped(this.cacheManager, APPOINTMENT_CACHE_SCOPE, cacheKey, result, CACHE_TTL.LIST);

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
    slots: { start: Date; end: Date; capacity: number; booked: number; available: boolean }[];
    currentCount: number;
    available: boolean;
  }> {
    const doctor = await this.doctorRepository.findOne({
      where: { id: doctorId, deletedAt: IsNull() },
    });
    if (!doctor) {
      throw new NotFoundException(`Médico con ID ${doctorId} no encontrado.`);
    }

    const dayStart = parseLocalDate(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = parseLocalDate(date);
    dayEnd.setHours(23, 59, 59, 999);

    const dayOfWeek = dayStart.getDay();

    // Obtener horarios del doctor para ese día
    let schedule: { startTime: string; endTime: string; maxDailyAppointments: number }[] = [];
    let blocks: Awaited<ReturnType<DoctorScheduleService['getScheduleForDoctorOnDay']>> = [];
    if (medicalCenterId) {
      blocks = await this.scheduleService.getScheduleForDoctorOnDay(
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
    const dayFull = currentCount >= dailyCap(blocks);
    // A full day closes every slot, so a turn picker never offers a time the daily cap rejects.
    const slots = this.slotGrid(dayStart, blocks, appointments).map((s) =>
      dayFull ? { ...s, available: false } : s,
    );
    const available = schedule.length > 0 && !dayFull && slots.some((s) => s.available);

    return { occupiedSlots, schedule, slots, currentCount, available };
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

    // Blocks per weekday: a day can have several (morning and afternoon)
    const scheduledDays = new Map<number, typeof schedules>();
    for (const sc of schedules) {
      scheduledDays.set(sc.dayOfWeek, [...(scheduledDays.get(sc.dayOfWeek) ?? []), sc]);
    }

    const result: { date: string; dayOfWeek: number; slotsAvailable: number }[] = [];
    const current = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      const blocks = scheduledDays.get(dayOfWeek);

      if (blocks) {
        // Contar citas existentes para ese día
        const dayStart = new Date(current);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(current);
        dayEnd.setHours(23, 59, 59, 999);

        const dayAppointments = await this.appointmentRepository
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
          .getMany();

        // Bounded by both the daily cap and the free places left in the day's slots (MJ-19)
        const freeInSlots = this.slotGrid(dayStart, blocks, dayAppointments).reduce(
          (sum, s) => sum + Math.max(0, s.capacity - s.booked),
          0,
        );
        const slotsAvailable = Math.min(dailyCap(blocks) - dayAppointments.length, freeInSlots);
        if (slotsAvailable > 0) {
          result.push({
            date: formatLocalDate(current),
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
