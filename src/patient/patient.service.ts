import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { IsNull, Repository } from 'typeorm';
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

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Obtiene el doctorId vinculado al usuario autenticado.
   * Retorna null si no es doctor.
   */
  private async getDoctorIdForUser(user: any): Promise<string | null> {
    if (!user?.id) return null;
    const userEntity = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['commonPerson'],
    });
    if (!userEntity?.commonPerson) return null;
    const doctor = await this.doctorRepository.findOne({
      where: { commonPerson: { id: userEntity.commonPerson.id } },
    });
    return doctor?.id ?? null;
  }

  /**
   * 🔥 Método para limpiar cache de paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    const listKey = 'patient:query:keys';

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
   * Genera un código de paciente único
   * Formato: PAC-YYYY-XXXXX (ej: PAC-2026-00001)
   */
  private async generatePatientCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PAC-${year}-`;

    // Obtener el último código de paciente del año actual
    const lastPatient = await this.patientRepository
      .createQueryBuilder('patient')
      .where('patient.patientCode LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('patient.patientCode', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (lastPatient) {
      const lastNumber = parseInt(lastPatient.patientCode.split('-')[2], 10);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
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
      let commonPerson: CommonPerson | null = null;

      // 1️⃣ Buscar si ya existe CommonPerson por número de documento
      if (createPatientDto.commonPerson.documentNumber) {
        const where: any = {
          documentNumber: createPatientDto.commonPerson.documentNumber,
          deletedAt: IsNull(),
        };

        // Si se proporciona letra (tipo de documento), agregarla al filtro
        if (createPatientDto.commonPerson.letter) {
          where.letter = createPatientDto.commonPerson.letter;
        }

        const existingPerson = await this.commonPersonRepository.findOne({
          where,
        });

        if (existingPerson) {
          commonPerson = existingPerson;
        }
      }

      // 2️⃣ Si no existe, crear nuevo CommonPerson
      if (!commonPerson) {
        const newPerson = this.commonPersonRepository.create(
          createPatientDto.commonPerson,
        );
        commonPerson = await this.commonPersonRepository.save(newPerson);
      }

      // 3️⃣ Verificar si esta persona ya está registrada como paciente
      const existingPatient = await this.patientRepository.findOne({
        where: { commonPersonId: commonPerson.id },
      });

      if (existingPatient) {
        throw new BadRequestException(
          'Esta persona ya está registrada como paciente.',
        );
      }

      // 4️⃣ Cargar alergias si se proporcionaron
      let allergies: Allergy[] = [];
      if (
        createPatientDto.allergyIds &&
        createPatientDto.allergyIds.length > 0
      ) {
        allergies = await this.allergyRepository.findByIds(
          createPatientDto.allergyIds,
        );

        if (allergies.length !== createPatientDto.allergyIds.length) {
          throw new BadRequestException(
            'Una o más alergias proporcionadas no existen.',
          );
        }
      }

      // 5️⃣ Cargar enfermedades crónicas si se proporcionaron
      let chronicDiseases: ChronicDisease[] = [];
      if (
        createPatientDto.chronicDiseaseIds &&
        createPatientDto.chronicDiseaseIds.length > 0
      ) {
        chronicDiseases = await this.chronicDiseaseRepository.findByIds(
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

      // 6️⃣ Cargar medicamentos si se proporcionaron
      let medications: Medication[] = [];
      if (
        createPatientDto.medicationIds &&
        createPatientDto.medicationIds.length > 0
      ) {
        medications = await this.medicationRepository.findByIds(
          createPatientDto.medicationIds,
        );

        if (medications.length !== createPatientDto.medicationIds.length) {
          throw new BadRequestException(
            'Uno o más medicamentos proporcionados no existen.',
          );
        }
      }

      // 7️⃣ Generar código de paciente único si no se proporciona
      let patientCode = createPatientDto.patientCode;
      if (!patientCode) {
        patientCode = await this.generatePatientCode();
      } else {
        // Verificar que el código no esté en uso
        const existingCode = await this.patientRepository.findOne({
          where: { patientCode },
        });
        if (existingCode) {
          throw new BadRequestException(
            `El código de paciente "${patientCode}" ya está en uso.`,
          );
        }
      }

      // 8️⃣ Crear el paciente
      const {
        allergyIds,
        chronicDiseaseIds,
        medicationIds,
        commonPerson: _,
        ...patientData
      } = createPatientDto;

      const newPatient = this.patientRepository.create({
        ...patientData,
        patientCode,
        commonPersonId: commonPerson.id,
        commonPerson,
        allergies,
        chronicDiseases,
        medications,
        createdBy: userId,
      });

      const savedPatient = await this.patientRepository.save(newPatient);

      // 🧹 Limpiar cache global
      await this.cacheManager.del('patient:all');
      await this.clearQueryCache();

      // Retornar con relaciones cargadas
      return this.findOne(savedPatient.id);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Error al crear el paciente: ${error.message}`,
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

    // IDOR: si es doctor, solo ve pacientes de sus citas
    const doctorId = user ? await this.getDoctorIdForUser(user) : null;

    // 🔑 Key única para esta consulta
    const cacheKey = `patient:query:${JSON.stringify({ ...query, doctorId })}`;

    // 📌 Key donde guardamos TODAS las keys usadas por findAll
    const listKey = 'patient:query:keys';

    // 1️⃣ Consultar cache
    const cached = await this.cacheManager.get(cacheKey);
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

    // IDOR: doctor solo ve pacientes con los que tiene citas
    if (doctorId) {
      qb.andWhere(
        `patient.id IN (SELECT ma."patient_id" FROM medical_appointments ma WHERE ma."doctor_id" = :doctorId)`,
        { doctorId },
      );
    }

    qb.orderBy('patient.id', order);
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
   * Obtener un paciente por ID con cache
   * @param id - ID del paciente
   * @returns Paciente encontrado con todas sus relaciones
   */
  async findOne(id: string): Promise<Patient> {
    const cacheKey = `patient:${id}`;

    try {
      // Consultar cache
      const cached = await this.cacheManager.get<Patient>(cacheKey);
      if (cached) return cached;

      const patient = await this.patientRepository.findOne({
        where: { id },
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

      // Guardar en cache por 10 min
      await this.cacheManager.set(cacheKey, patient, 600);

      return patient;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException(
        `Error al obtener el paciente: ${error.message}`,
      );
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
      const cached = await this.cacheManager.get<Patient>(cacheKey);
      if (cached) return cached;

      const qb = this.patientRepository
        .createQueryBuilder('patient')
        .leftJoinAndSelect('patient.commonPerson', 'commonPerson')
        .leftJoinAndSelect('patient.allergies', 'allergies')
        .leftJoinAndSelect('patient.chronicDiseases', 'chronicDiseases')
        .leftJoinAndSelect('patient.medications', 'medications')
        .where('commonPerson.documentNumber = :documentNumber', {
          documentNumber,
        });

      if (letter) {
        qb.andWhere('commonPerson.letter = :letter', { letter });
      }

      const patient = await qb.getOne();

      if (!patient) {
        throw new NotFoundException(
          `Paciente con documento ${documentNumber} no encontrado`,
        );
      }

      await this.cacheManager.set(cacheKey, patient, 600);

      return patient;
    } catch (error) {
      throw new NotFoundException(
        `Error al buscar paciente por documento: ${error.message}`,
      );
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
    try {
      const patient = await this.patientRepository.findOne({
        where: { id },
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
        await this.commonPersonRepository.update(
          patient.commonPersonId,
          updatePatientDto.commonPerson,
        );
      }

      // Actualizar alergias si se proporcionan
      if (updatePatientDto.allergyIds !== undefined) {
        let allergies: Allergy[] = [];
        if (updatePatientDto.allergyIds.length > 0) {
          allergies = await this.allergyRepository.findByIds(
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
          chronicDiseases = await this.chronicDiseaseRepository.findByIds(
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
          medications = await this.medicationRepository.findByIds(
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
      await this.cacheManager.del(`patient:${id}`);
      await this.cacheManager.del('patient:all');
      await this.clearQueryCache();

      return this.findOne(updatedPatient.id);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Error al actualizar el paciente: ${error.message}`,
      );
    }
  }

  /**
   * Eliminar un paciente (soft delete)
   * @param id - ID del paciente a eliminar
   */
  async remove(id: string): Promise<void> {
    try {
      const patient = await this.findOne(id);

      if (!patient) {
        throw new NotFoundException(`Paciente con ID ${id} no encontrado.`);
      }

      // Soft delete: establecer deletedAt
      await this.patientRepository.update(id, {
        deletedAt: new Date(),
        isActive: false,
      });

      // 🧹 Limpiar caches
      await this.cacheManager.del(`patient:${id}`);
      await this.cacheManager.del('patient:all');
      await this.clearQueryCache();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException(
        `Error al eliminar el paciente: ${error.message}`,
      );
    }
  }
}
