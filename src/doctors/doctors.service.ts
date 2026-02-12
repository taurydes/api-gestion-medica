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
import { FindOptions, FindOptionsWhere, Repository } from 'typeorm';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { DoctorQueryDto } from './dto/doctor-query.dto';
import { Doctor } from './entities/doctor.entity';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectRepository(Doctor, DatabaseConnectionName.DB_MAIN)
    private readonly doctorRepository: Repository<Doctor>,

    @InjectRepository(CommonPerson, DatabaseConnectionName.DB_MAIN)
    private readonly commonPersonRepository: Repository<CommonPerson>,

    @InjectRepository(Specialty, DatabaseConnectionName.DB_MAIN)
    private readonly specialtyRepository: Repository<Specialty>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Método para limpiar cache de paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    const listKey = 'doctor:query:keys';
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];

    for (const key of keys) {
      await this.cacheManager.del(key);
    }

    await this.cacheManager.del(listKey);
  }

  /**
   * Crear doctor
   */
  async create(dto: CreateDoctorDto): Promise<Doctor> {
    try {
      let commonPerson;
      const specialty = await this.specialtyRepository.findOne({
        where: { id: dto.specialtyId },
      });

      if (!specialty) {
        throw new BadRequestException(
          'La especialidad no existe.',
        );
      }

      // 1. Buscar si ya existe CommonPerson por número de documento
      if (!dto.commonPerson) {
        throw new BadRequestException(
          'La información de la persona es requerida para este endpoint.',
        );
      }

      if (dto.commonPerson.documentNumber) {
        const whereConditions: FindOptionsWhere<CommonPerson> = {
          documentNumber: dto.commonPerson.documentNumber,
        };

        if (dto.commonPerson.letter) {
          whereConditions.letter = dto.commonPerson.letter;
        }

        const existingPerson = await this.commonPersonRepository.findOne({
          where: whereConditions,
        });

        if (existingPerson) {
          commonPerson = existingPerson;
        }
      }

      // 2. Si no existe, crear nuevo CommonPerson
      if (!commonPerson) {
        const newPerson = this.commonPersonRepository.create(dto.commonPerson);
        commonPerson = await this.commonPersonRepository.save(newPerson);
      }

      // 3. Validar que el centro médico exista (si se proporciona)
      // LEAGACY: medicalCenterId removed in favor of ManyToMany in MedicalCenter

      // 4. Validar que no exista otro doctor con el mismo número de licencia
      const existingDoctor = await this.doctorRepository.findOne({
        where: { licenseNumber: dto.licenseNumber },
      });

      if (existingDoctor) {
        throw new BadRequestException(
          'Ya existe un doctor con ese número de licencia.',
        );
      }

      // 5. Crear doctor asociado al CommonPerson
      const newDoctor = this.doctorRepository.create({
        ...dto,
        commonPersonId: commonPerson.id,
        commonPerson,
      });
      const doctor = await this.doctorRepository.save(newDoctor);

      // Limpiar cache global
      await this.cacheManager.del('doctor:all');
      await this.clearQueryCache();

      return doctor;
    } catch (error) {
      throw new BadRequestException(
        `Error al crear el doctor: ${error.message}`,
      );
    }
  }

  /**
   * Listar doctores con filtros + paginación + cache
   */
  async findAll(query: DoctorQueryDto) {
    const { page, limit, order, search, medicalCenterId, isActive } = query;

    const cacheKey = `doctor:query:${JSON.stringify(query)}`;
    const listKey = 'doctor:query:keys';

    // Consultar cache
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    // Construir QueryBuilder
    const qb = this.doctorRepository
      .createQueryBuilder('doctor')
      .leftJoinAndSelect('doctor.commonPerson', 'person')
      .leftJoinAndSelect('doctor.medicalCenters', 'centers')
      .where('doctor.deletedAt IS NULL');

    // Filtros
    if (search) {
      qb.andWhere(
        '(doctor.specialty ILIKE :search OR doctor.licenseNumber ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (medicalCenterId) {
      qb.innerJoin('doctor.medicalCenters', 'mc', 'mc.id = :medicalCenterId', {
        medicalCenterId,
      });
    }

    if (isActive !== undefined) {
      qb.andWhere('doctor.isActive = :isActive', { isActive });
    }

    qb.orderBy('doctor.id', order);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const result = { data: items, total, page, limit };

    // Guardar en cache por 5 min
    await this.cacheManager.set(cacheKey, result, 300);

    // Registrar la key para poder limpiarla después
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    if (!keys.includes(cacheKey)) {
      keys.push(cacheKey);
      await this.cacheManager.set(listKey, keys);
    }

    return result;
  }

  /**
   * Obtener doctor por ID con cache
   */
  async findOne(id: number): Promise<Doctor> {
    const cacheKey = `doctor:${id}`;

    try {
      const cached = await this.cacheManager.get<Doctor>(cacheKey);
      if (cached) return cached;

      const doctor = await this.doctorRepository.findOne({
        where: { id },
        relations: ['commonPerson', 'medicalCenters'],
      });

      if (!doctor) {
        throw new NotFoundException(`Doctor con ID ${id} no encontrado.`);
      }

      await this.cacheManager.set(cacheKey, doctor, 600);

      return doctor;
    } catch (error) {
      throw new NotFoundException(
        `Error al obtener el doctor: ${error.message}`,
      );
    }
  }

  /**
   * Actualizar doctor
   */
  async update(id: number, dto: UpdateDoctorDto): Promise<Doctor> {
    try {
      const doctor = await this.doctorRepository.findOneBy({ id });

      if (!doctor) {
        throw new NotFoundException(`Doctor con ID ${id} no encontrado.`);
      }

      // Validar centro médico si se proporciona
      // LEGACY: medicalCenterId removed

      await this.doctorRepository.update(id, dto);
      const updated = await this.doctorRepository.findOneBy({ id });

      if (!updated) {
        throw new NotFoundException('Error al actualizar el doctor.');
      }

      // Limpiar caches
      await this.cacheManager.del(`doctor:${id}`);
      await this.cacheManager.del('doctor:all');
      await this.clearQueryCache();

      return updated;
    } catch (error) {
      throw new BadRequestException(
        `Error al actualizar el doctor: ${error.message}`,
      );
    }
  }

  /**
   * Eliminar doctor (soft delete)
   */
  async remove(id: number): Promise<void> {
    try {
      const doctor = await this.doctorRepository.findOneBy({ id });
      if (!doctor) {
        throw new NotFoundException(`Doctor con ID ${id} no encontrado.`);
      }

      doctor.deletedAt = new Date();
      await this.doctorRepository.save(doctor);

      await this.cacheManager.del(`doctor:${id}`);
      await this.cacheManager.del('doctor:all');
      await this.clearQueryCache();
    } catch (error) {
      throw new NotFoundException(
        `Error al eliminar el doctor: ${error.message}`,
      );
    }
  }
}
