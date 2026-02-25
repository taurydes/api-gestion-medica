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
import { In, Repository } from 'typeorm';
import { Department } from './entities/department.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DepartmentQueryDto } from './dto/department-query.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department, DatabaseConnectionName.DB_MAIN)
    private readonly departmentRepository: Repository<Department>,

    @InjectRepository(MedicalCenter, DatabaseConnectionName.DB_MAIN)
    private readonly medicalCenterRepository: Repository<MedicalCenter>,

    @InjectRepository(Specialty, DatabaseConnectionName.DB_MAIN)
    private readonly specialtyRepository: Repository<Specialty>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  // ─── Cache helpers ─────────────────────────────────────────────────────────

  private async clearQueryCache(): Promise<void> {
    const listKey = 'department:query:keys';
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    for (const key of keys) {
      await this.cacheManager.del(key);
    }
    await this.cacheManager.del(listKey);
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  /**
   * Crear un nuevo departamento
   */
  async create(dto: CreateDepartmentDto, userId?: number): Promise<Department> {
    try {
      const { specialtyIds, ...data } = dto;

      // Validar que el centro médico exista
      const center = await this.medicalCenterRepository.findOne({
        where: { id: dto.medicalCenterId },
      });
      if (!center) {
        throw new NotFoundException(
          `Centro médico con ID ${dto.medicalCenterId} no encontrado.`,
        );
      }

      // Resolver especialidades si se proporcionan
      let specialties: Specialty[] = [];
      if (specialtyIds && specialtyIds.length > 0) {
        specialties = await this.specialtyRepository.findBy({
          id: In(specialtyIds),
        });
      }

      const department = this.departmentRepository.create({
        ...data,
        specialties,
        createdBy: userId ?? null,
      });
      const saved = await this.departmentRepository.save(department);

      await this.cacheManager.del('department:all');
      await this.clearQueryCache();

      return this.findOne(saved.id);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException(
        `Error al crear el departamento: ${error.message}`,
      );
    }
  }

  /**
   * Listar departamentos con filtros y paginación
   */
  async findAll(query: DepartmentQueryDto) {
    const { page, limit, order, search, medicalCenterId, isActive } = query;

    const cacheKey = `department:query:${JSON.stringify(query)}`;
    const listKey = 'department:query:keys';

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const qb = this.departmentRepository
      .createQueryBuilder('department')
      .leftJoinAndSelect('department.medicalCenter', 'medicalCenter')
      .leftJoinAndSelect('department.specialties', 'specialties')
      .where('department.deletedAt IS NULL');

    if (search) {
      qb.andWhere('department.name ILIKE :search', {
        search: `%${search}%`,
      });
    }

    if (medicalCenterId) {
      qb.andWhere('department.medicalCenterId = :medicalCenterId', {
        medicalCenterId,
      });
    }

    if (isActive !== undefined) {
      qb.andWhere('department.isActive = :isActive', { isActive });
    }

    qb.orderBy('department.id', order)
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
   * Obtener un departamento por ID
   */
  async findOne(id: number): Promise<Department> {
    const cacheKey = `department:${id}`;

    try {
      const cached = await this.cacheManager.get<Department>(cacheKey);
      if (cached) return cached;

      const department = await this.departmentRepository.findOne({
        where: { id, deletedAt: undefined },
        relations: ['medicalCenter', 'specialties'],
      });

      if (!department) {
        throw new NotFoundException(`Departamento con ID ${id} no encontrado.`);
      }

      await this.cacheManager.set(cacheKey, department, 600);
      return department;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException(
        `Error al obtener el departamento: ${error.message}`,
      );
    }
  }

  /**
   * Actualizar un departamento
   */
  async update(
    id: number,
    dto: UpdateDepartmentDto,
    userId?: number,
  ): Promise<Department> {
    try {
      const { specialtyIds, ...data } = dto;

      const department = await this.departmentRepository.findOne({
        where: { id },
        relations: ['specialties'],
      });

      if (!department) {
        throw new NotFoundException(`Departamento con ID ${id} no encontrado.`);
      }

      if (data.medicalCenterId) {
        const center = await this.medicalCenterRepository.findOne({
          where: { id: data.medicalCenterId },
        });
        if (!center) {
          throw new NotFoundException(
            `Centro médico con ID ${data.medicalCenterId} no encontrado.`,
          );
        }
      }

      // Actualizar especialidades si se proporcionan
      if (specialtyIds) {
        if (specialtyIds.length > 0) {
          department.specialties = await this.specialtyRepository.findBy({
            id: In(specialtyIds),
          });
        } else {
          department.specialties = [];
        }
      }

      Object.assign(department, { ...data, updatedBy: userId ?? null });
      await this.departmentRepository.save(department);

      await this.cacheManager.del(`department:${id}`);
      await this.cacheManager.del('department:all');
      await this.clearQueryCache();

      return this.findOne(id);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;
      throw new BadRequestException(
        `Error al actualizar el departamento: ${error.message}`,
      );
    }
  }

  /**
   * Eliminar un departamento (soft delete)
   */
  async remove(id: number): Promise<void> {
    try {
      const department = await this.departmentRepository.findOne({
        where: { id },
      });

      if (!department) {
        throw new NotFoundException(`Departamento con ID ${id} no encontrado.`);
      }

      department.deletedAt = new Date();
      department.isActive = false;
      await this.departmentRepository.save(department);

      await this.cacheManager.del(`department:${id}`);
      await this.cacheManager.del('department:all');
      await this.clearQueryCache();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException(
        `Error al eliminar el departamento: ${error.message}`,
      );
    }
  }
}
