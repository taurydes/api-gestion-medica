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
import { FindOptions, FindOptionsWhere, In, IsNull, Repository } from 'typeorm';
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
  ) {}

  // ─── IDOR helpers ──────────────────────────────────────────────────────────

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

  private async isAdminUser(userId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['role'],
    });
    const roleName = (user?.role?.name ?? '').toLowerCase();
    return roleName.includes('admin') || roleName.includes('super');
  }

  private async assertDoctorAccess(doctorId: string, authUser?: any): Promise<void> {
    if (!authUser?.id) return;
    const isAdmin = await this.isAdminUser(authUser.id);
    if (isAdmin) return;
    const myDoctorId = await this.getDoctorIdForUser(authUser.id);
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
      // 1. Validar Especialidades
      let specialties: Specialty[] = [];
      if (dto.specialtyIds && dto.specialtyIds.length > 0) {
        specialties = await this.specialtyRepository.findBy({
          id: In(dto.specialtyIds),
        });
        if (specialties.length !== dto.specialtyIds.length) {
          throw new BadRequestException('Una o más especialidades no existen.');
        }
      }

      let commonPerson;
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

      // 3. Validar que los centros médicos existan (si se proporcionan)
      let medicalCenters: MedicalCenter[] = [];
      if (dto.medicalCenterIds && dto.medicalCenterIds.length > 0) {
        medicalCenters = await this.medicalCenterRepository.findBy({
          id: In(dto.medicalCenterIds),
        });

        if (medicalCenters.length !== dto.medicalCenterIds.length) {
          throw new BadRequestException(
            'Uno o más centros médicos no existen.',
          );
        }
      }

      // 4. Validar que no exista otro doctor con el mismo número de licencia
      const existingDoctor = await this.doctorRepository.findOne({
        where: { licenseNumber: dto.licenseNumber },
      });

      if (existingDoctor) {
        throw new BadRequestException(
          'Ya existe un doctor con ese número de licencia.',
        );
      }

      // 5. Crear doctor asociado al CommonPerson y Centros Médicos
      const newDoctor = this.doctorRepository.create({
        ...dto,
        commonPersonId: commonPerson.id,
        commonPerson,
        medicalCenters,
        specialties,
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
    let myDoctorId: string | null = null;
    if (authUser?.id) {
      const isAdmin = await this.isAdminUser(authUser.id);
      if (!isAdmin) {
        myDoctorId = await this.getDoctorIdForUser(authUser.id);
      }
    }

    const cacheKey = `doctor:query:${JSON.stringify({ ...query, myDoctorId })}`;
    const listKey = 'doctor:query:keys';

    // Consultar cache
    const cached = await this.cacheManager.get(cacheKey);
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
  async findOne(id: string, authUser?: any): Promise<Doctor & { imageUrl: string | null }> {
    const cacheKey = `doctor:${id}`;

    try {
      await this.assertDoctorAccess(id, authUser);

      const cached = await this.cacheManager.get<Doctor & { imageUrl: string | null }>(cacheKey);
      if (cached) return cached;

      const doctor = await this.doctorRepository.findOne({
        where: { id },
        relations: ['commonPerson', 'medicalCenters', 'specialties'],
      });

      if (!doctor) {
        throw new NotFoundException(`Doctor con ID ${id} no encontrado.`);
      }

      const imageUrl = await this.getDoctorImageUrl(id);
      const result = { ...doctor, imageUrl };

      await this.cacheManager.set(cacheKey, result, 600);

      return result;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new NotFoundException(
        `Error al obtener el doctor: ${error.message}`,
      );
    }
  }

  /**
   * Actualizar doctor
   */
  async update(id: string, dto: UpdateDoctorDto, authUser?: any): Promise<Doctor> {
    await this.assertDoctorAccess(id, authUser);
    try {
      const doctor = await this.doctorRepository.findOne({
        where: { id },
        relations: ['commonPerson', 'medicalCenters', 'specialties'],
      });

      if (!doctor) {
        throw new NotFoundException(`Doctor con ID ${id} no encontrado.`);
      }

      // 1. Sincronizar Centros Médicos y Especialidades
      if (dto.medicalCenterIds) {
        const centers = await this.medicalCenterRepository.findBy({
          id: In(dto.medicalCenterIds),
        });
        doctor.medicalCenters = centers;
      }

      if (dto.specialtyIds) {
        const specialties = await this.specialtyRepository.findBy({
          id: In(dto.specialtyIds),
        });
        doctor.specialties = specialties;
      }
      // 2. Actualizar CommonPerson si se proporciona
      if (dto.commonPerson && doctor.commonPerson) {
        Object.assign(doctor.commonPerson, dto.commonPerson);
        await this.commonPersonRepository.save(doctor.commonPerson);
      }

      // 3. Actualizar campos directos del Doctor
      const { medicalCenterIds, specialtyIds, commonPerson, ...doctorData } =
        dto;
      Object.assign(doctor, doctorData);

      const updated = await this.doctorRepository.save(doctor);

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
  async remove(id: string): Promise<void> {
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
