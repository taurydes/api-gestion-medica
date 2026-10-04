import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { applyPatientScope, assertPatientInScope } from './patient-scope';
import { assertNoOpenAppointments } from 'src/medical-appointments/open-appointments';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import {
  assertDocumentAvailable,
  personDocumentWhere,
  uniqueViolationToConflict,
} from 'src/common-person/person-document.util';
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
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientQueryDto } from './dto/patient-query.dto';
import { Patient } from './entities/patient.entity';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Allergy } from 'src/parameters/entities/allergy.entity';
import { ChronicDisease } from 'src/parameters/entities/chronic-disease.entity';
import { Medication } from 'src/parameters/entities/medication.entity';
import { User } from 'src/user/entities/user.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { CommonPersonImage } from 'src/common-person/entities/common-person-image.entity';
import { FilesService } from 'src/files/files.service';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { toHttpException } from 'src/common/exceptions/to-http-exception';

/**
 * Servicio para gestionar los pacientes del sistema
 * Incluye CRUD completo con caché Redis, soft delete y validaciones
 */
@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient, DatabaseConnectionName.DB_MAIN)
    private readonly patientRepository: Repository<Patient>,

    @InjectRepository(CommonPerson, DatabaseConnectionName.DB_MAIN)
    private readonly commonPersonRepository: Repository<CommonPerson>,

    @InjectRepository(Allergy, DatabaseConnectionName.DB_MAIN)
    private readonly allergyRepository: Repository<Allergy>,

    @InjectRepository(ChronicDisease, DatabaseConnectionName.DB_MAIN)
    private readonly chronicDiseaseRepository: Repository<ChronicDisease>,

    @InjectRepository(Medication, DatabaseConnectionName.DB_MAIN)
    private readonly medicationRepository: Repository<Medication>,

    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Doctor, DatabaseConnectionName.DB_MAIN)
    private readonly doctorRepository: Repository<Doctor>,

    @InjectRepository(CommonPersonImage, DatabaseConnectionName.DB_MAIN)
    private readonly commonPersonImageRepository: Repository<CommonPersonImage>,

    private readonly filesService: FilesService,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,

    @InjectDataSource(DatabaseConnectionName.DB_MAIN)
    private readonly dataSource: DataSource,

    private readonly authContextService: AuthContextService,
  ) {}

  /**
   * 🔥 Método para limpiar cache de paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    await invalidateScope(this.cacheManager, 'patient');
    // Recipe and history details embed the patient
    await invalidateScope(this.cacheManager, 'recipe');
    await invalidateScope(this.cacheManager, 'medical-history');
    // Appointment views embed this entity: drop them too
    await invalidateScope(this.cacheManager, APPOINTMENT_CACHE_SCOPE);
  }

  private async getPatientImageUrl(commonPersonId: string): Promise<string | null> {
    const img = await this.commonPersonImageRepository.findOne({
      where: { commonPersonId, isActive: true, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return img ? this.filesService.getCommonPersonImageUrl(img.id) : null;
  }

  /** Catalog rows by id, ignoring soft-deleted ones, so a deleted allergy or drug is reported as missing (M-22). */
  private activeByIds<T extends { id: string; deletedAt: Date | null }>(
    repo: Repository<T>,
    ids: string[],
  ): Promise<T[]> {
    return repo.findBy({ id: In(ids), deletedAt: IsNull() } as any);
  }

  /**
   * Genera un código de paciente único
   * Formato: PAC-YYYY-XXXXX (ej: PAC-2026-00001)
   */
  private async generatePatientCode(
    patientRepo: Repository<Patient> = this.patientRepository,
  ): Promise<string> {
    return nextCode(patientRepo, 'PAC');
  }

  /**
   * Crear un nuevo paciente
   * Si el número de documento ya existe en CommonPerson, se asocia esa persona al paciente
   * @param createPatientDto - Datos del paciente a crear
   * @param userId - ID del usuario que crea el registro (opcional)
   * @returns Paciente creado con todas sus relaciones
   */
  async create(
    createPatientDto: CreatePatientDto,
    userId?: string,
  ): Promise<Patient> {
    try {
      // Catalog ids and patientCode are validated before any write, so a 4xx leaves no orphan person (M-25).
      // 1️⃣ Cargar alergias si se proporcionaron
      let allergies: Allergy[] = [];
      if (
        createPatientDto.allergyIds &&
        createPatientDto.allergyIds.length > 0
      ) {
        allergies = await this.activeByIds(this.allergyRepository,
          createPatientDto.allergyIds,
        );

        if (allergies.length !== createPatientDto.allergyIds.length) {
          throw new BadRequestException(
            'Una o más alergias proporcionadas no existen.',
          );
        }
      }

      // 2️⃣ Cargar enfermedades crónicas si se proporcionaron
      let chronicDiseases: ChronicDisease[] = [];
      if (
        createPatientDto.chronicDiseaseIds &&
        createPatientDto.chronicDiseaseIds.length > 0
      ) {
        chronicDiseases = await this.activeByIds(this.chronicDiseaseRepository,
          createPatientDto.chronicDiseaseIds,
        );

        if (
          chronicDiseases.length !== createPatientDto.chronicDiseaseIds.length
        ) {
          throw new BadRequestException(
            'Una o más enfermedades crónicas proporcionadas no existen.',
          );
        }
      }

      // 3️⃣ Cargar medicamentos si se proporcionaron
      let medications: Medication[] = [];
      if (
        createPatientDto.medicationIds &&
        createPatientDto.medicationIds.length > 0
      ) {
        medications = await this.activeByIds(this.medicationRepository,
          createPatientDto.medicationIds,
        );

        if (medications.length !== createPatientDto.medicationIds.length) {
          throw new BadRequestException(
            'Uno o más medicamentos proporcionados no existen.',
          );
        }
      }

      // 4️⃣ Verificar que el código no esté en uso
      if (createPatientDto.patientCode) {
        const existingCode = await this.patientRepository.findOne({
          where: { patientCode: createPatientDto.patientCode },
        });
        if (existingCode) {
          throw new BadRequestException(
            `El código de paciente "${createPatientDto.patientCode}" ya está en uso.`,
          );
        }
      }

      // Person and patient are written in one transaction
      const savedPatient = await this.dataSource.transaction(async (manager) => {
        const personRepo = manager.getRepository(CommonPerson);
        const patientRepo = manager.getRepository(Patient);

        // 5️⃣ Buscar la persona por letra + documento, o crearla
        let commonPerson: CommonPerson | null = null;
        if (createPatientDto.commonPerson.documentNumber) {
          commonPerson = await personRepo.findOne({
            where: personDocumentWhere(
              createPatientDto.commonPerson.letter,
              createPatientDto.commonPerson.documentNumber,
            ),
          });
        }
        if (!commonPerson) {
          commonPerson = await personRepo.save(
            personRepo.create(createPatientDto.commonPerson),
          );
        }

        // 6️⃣ Verificar si esta persona ya está registrada como paciente activo
        // (el índice único es parcial: un paciente borrado no bloquea el nuevo registro)
        const existingPatient = await patientRepo.findOne({
          where: { commonPersonId: commonPerson.id, deletedAt: IsNull() },
        });
        if (existingPatient) {
          throw new BadRequestException(
            'Esta persona ya está registrada como paciente.',
          );
        }

        // 7️⃣ Crear el paciente
        const {
          allergyIds,
          chronicDiseaseIds,
          medicationIds,
          commonPerson: _,
          ...patientData
        } = createPatientDto;

        const newPatient = patientRepo.create({
          ...patientData,
          patientCode:
            createPatientDto.patientCode ?? (await this.generatePatientCode(patientRepo)),
          commonPersonId: commonPerson.id,
          commonPerson,
          allergies,
          chronicDiseases,
          medications,
          createdBy: userId,
        });

        return patientRepo.save(newPatient);
      });

      // 🧹 Limpiar cache global
      await this.cacheManager.del('patient:all');
      await this.clearQueryCache();

      // Retornar con relaciones cargadas
      return this.findOne(savedPatient.id);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw (
        uniqueViolationToConflict(error) ??
        toHttpException(error, 'Error al crear el paciente.')
      );
    }
  }

  /**
   * Listar pacientes con filtros + paginación + cache
   * @param query - Parámetros de búsqueda y paginación
   * @returns Lista paginada de pacientes
   */
  async findAll(query: PatientQueryDto, user?: any) {
    const { page, limit, order, search, bloodType, isActive } = query;

    // Doctor: own patients; other staff: patients of their centers; both: the ones they registered.
    const scope = await this.authContextService.resolveScope(user?.id);

    // 🔑 Key única para esta consulta
    const cacheKey = `patient:query:${JSON.stringify({ ...query, scope })}`;

    // 📌 Key donde guardamos TODAS las keys usadas por findAll

    // 1️⃣ Consultar cache
    const cached = await getScoped(this.cacheManager, 'patient', cacheKey);
    if (cached) return cached;

    // 2️⃣ Construir QueryBuilder
    const qb = this.patientRepository
      .createQueryBuilder('patient')
      .leftJoinAndSelect('patient.commonPerson', 'commonPerson')
      .leftJoinAndSelect('patient.allergies', 'allergies')
      .leftJoinAndSelect('patient.chronicDiseases', 'chronicDiseases')
      .leftJoinAndSelect('patient.medications', 'medications')
      .where('patient.deletedAt IS NULL');

    // 🔍 Filtros
    if (search) {
      qb.andWhere(
        '(commonPerson.firstName ILIKE :search OR commonPerson.lastName ILIKE :search OR commonPerson.documentNumber ILIKE :search OR patient.patientCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (bloodType) {
      qb.andWhere('patient.bloodType = :bloodType', { bloodType });
    }

    // MJ-22: the filter was read and ignored
    if (isActive !== undefined) {
      qb.andWhere('patient.isActive = :isActive', { isActive });
    }

    applyPatientScope(qb, scope);

    // By surname and name (MJ-22); the id only breaks ties so pages stay stable.
    qb.orderBy('commonPerson.lastName', order)
      .addOrderBy('commonPerson.firstName', order)
      .addOrderBy('patient.id', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const enrichedItems = await Promise.all(
      items.map(async (patient) => ({
        ...patient,
        imageUrl: patient.commonPersonId
          ? await this.getPatientImageUrl(patient.commonPersonId)
          : null,
      })),
    );

    const result = { data: enrichedItems, total, page, limit };

    // 3️⃣ Guardar en cache por 5 min
    await setScoped(this.cacheManager, 'patient', cacheKey, result, CACHE_TTL.LIST);

    return result;
  }

  /**
   * Obtener un paciente por ID con cache
   * @param id - ID del paciente
   * @returns Paciente encontrado con todas sus relaciones
   */
  async findOne(id: string, user?: any): Promise<Patient> {
    // Same rule as findAll (MJ-20, MJ-02)
    await assertPatientInScope(this.patientRepository, id, await this.authContextService.resolveScope(user?.id));

    const cacheKey = `patient:${id}`;

    try {
      // Consultar cache
      const cached = await getScoped<Patient>(this.cacheManager, 'patient', cacheKey);
      if (cached) return cached;

      const patient = await this.patientRepository.findOne({
        where: { id, deletedAt: IsNull() },
        relations: [
          'commonPerson',
          'allergies',
          'chronicDiseases',
          'medications',
        ],
      });

      if (!patient) {
        throw new NotFoundException(`Paciente con ID ${id} no encontrado.`);
      }

      const imageUrl = patient.commonPersonId
        ? await this.getPatientImageUrl(patient.commonPersonId)
        : null;
      const result = { ...patient, imageUrl } as any;

      // Guardar en cache por 10 min
      // Scoped: catalog edits (allergies, medications…) invalidate it along with the lists
      await setScoped(this.cacheManager, 'patient', cacheKey, result, CACHE_TTL.DETAIL);

      return result;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw toHttpException(error, 'Error al obtener el paciente.');
    }
  }

  /**
   * Buscar paciente por número de documento
   * @param documentNumber - Número de documento de identidad
   * @param letter - Letra del tipo de documento (opcional)
   * @returns Paciente encontrado o null
   */
  async findByDocumentNumber(
    documentNumber: string,
    letter?: string,
  ): Promise<Patient | null> {
    const cacheKey = `patient:doc:${letter || ''}${documentNumber}`;
    try {
      const cached = await getScoped<Patient>(this.cacheManager, 'patient', cacheKey);
      if (cached) return cached;

      // Identification only, unscoped so any doctor can book a patient registered by someone else:
      // no allergies, diseases or medications (MJ-21).
      const qb = this.patientRepository
        .createQueryBuilder('patient')
        .leftJoinAndSelect('patient.commonPerson', 'commonPerson')
        .where('commonPerson.documentNumber = :documentNumber', {
          documentNumber,
        })
        // A deleted patient is not found (MJ-21)
        .andWhere('patient.deletedAt IS NULL');

      if (letter) {
        qb.andWhere('commonPerson.letter = :letter', { letter });
      }

      const patient = await qb.getOne();

      if (!patient) {
        throw new NotFoundException(
          `Paciente con documento ${documentNumber} no encontrado`,
        );
      }

      // Tracked with the lists so update/remove drop it (the key has no patient id)
      await setScoped(this.cacheManager, 'patient', cacheKey, patient, CACHE_TTL.DETAIL);

      return patient;
    } catch (error) {
      throw toHttpException(error, 'Error al buscar paciente por documento.');
    }
  }

  /**
   * Actualizar un paciente existente
   * @param id - ID del paciente
   * @param updatePatientDto - Datos a actualizar
   * @param userId - ID del usuario que actualiza (opcional)
   * @returns Paciente actualizado
   */
  async update(
    id: string,
    updatePatientDto: UpdatePatientDto,
    userId?: string,
  ): Promise<Patient> {
    // Writes follow the read rule (MJ-21)
    await assertPatientInScope(this.patientRepository, id, await this.authContextService.resolveScope(userId));
    try {
      const patient = await this.patientRepository.findOne({
        where: { id, deletedAt: IsNull() },
        relations: [
          'commonPerson',
          'allergies',
          'chronicDiseases',
          'medications',
        ],
      });

      if (!patient) {
        throw new NotFoundException(`Paciente con ID ${id} no encontrado.`);
      }

      // Actualizar CommonPerson si se proporciona
      if (updatePatientDto.commonPerson) {
        await assertDocumentAvailable(
          this.commonPersonRepository,
          patient.commonPerson,
          updatePatientDto.commonPerson,
        );
        await this.commonPersonRepository.update(
          patient.commonPersonId,
          updatePatientDto.commonPerson,
        );
      }

      // Actualizar alergias si se proporcionan
      if (updatePatientDto.allergyIds !== undefined) {
        let allergies: Allergy[] = [];
        if (updatePatientDto.allergyIds.length > 0) {
          allergies = await this.activeByIds(this.allergyRepository,
            updatePatientDto.allergyIds,
          );
          if (allergies.length !== updatePatientDto.allergyIds.length) {
            throw new BadRequestException(
              'Una o más alergias proporcionadas no existen.',
            );
          }
        }
        patient.allergies = allergies;
      }

      // Actualizar enfermedades crónicas si se proporcionan
      if (updatePatientDto.chronicDiseaseIds !== undefined) {
        let chronicDiseases: ChronicDisease[] = [];
        if (updatePatientDto.chronicDiseaseIds.length > 0) {
          chronicDiseases = await this.activeByIds(this.chronicDiseaseRepository,
            updatePatientDto.chronicDiseaseIds,
          );
          if (
            chronicDiseases.length !== updatePatientDto.chronicDiseaseIds.length
          ) {
            throw new BadRequestException(
              'Una o más enfermedades crónicas proporcionadas no existen.',
            );
          }
        }
        patient.chronicDiseases = chronicDiseases;
      }

      // Actualizar medicamentos si se proporcionan
      if (updatePatientDto.medicationIds !== undefined) {
        let medications: Medication[] = [];
        if (updatePatientDto.medicationIds.length > 0) {
          medications = await this.activeByIds(this.medicationRepository,
            updatePatientDto.medicationIds,
          );
          if (medications.length !== updatePatientDto.medicationIds.length) {
            throw new BadRequestException(
              'Uno o más medicamentos proporcionados no existen.',
            );
          }
        }
        patient.medications = medications;
      }

      // Extraer campos a actualizar (sin relaciones)
      const {
        allergyIds,
        chronicDiseaseIds,
        medicationIds,
        commonPerson: _,
        ...patientData
      } = updatePatientDto;

      // Actualizar campos del paciente
      Object.assign(patient, {
        ...patientData,
        updatedBy: userId,
      });

      const updatedPatient = await this.patientRepository.save(patient);

      // 🧹 Limpiar caches
      await this.cacheManager.del('patient:all');
      await this.clearQueryCache();

      return this.findOne(updatedPatient.id);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw (
        uniqueViolationToConflict(error) ??
        toHttpException(error, 'Error al actualizar el paciente.')
      );
    }
  }

  /**
   * Eliminar un paciente (soft delete)
   * @param id - ID del paciente a eliminar
   */
  async remove(id: string, userId?: string): Promise<void> {
    await assertPatientInScope(this.patientRepository, id, await this.authContextService.resolveScope(userId));
    try {
      const patient = await this.findOne(id);

      if (!patient) {
        throw new NotFoundException(`Paciente con ID ${id} no encontrado.`);
      }

      await assertNoOpenAppointments(
        this.patientRepository.manager, { patientId: id }, 'eliminar el paciente',
      );

      // Soft delete: establecer deletedAt
      await this.patientRepository.update(id, {
        deletedAt: new Date(),
        isActive: false,
      });

      // 🧹 Limpiar caches
      await this.cacheManager.del('patient:all');
      await this.clearQueryCache();
    } catch (error) {
      throw toHttpException(error, 'Error al eliminar el paciente.');
    }
  }
}
