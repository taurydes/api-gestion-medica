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
import { Repository } from 'typeorm';
import { CreateMedicalCenterDto } from './dto/create-medical-center.dto';
import { UpdateMedicalCenterDto } from './dto/update-medical-center.dto';
import { MedicalCenterQueryDto } from './dto/medical-center-query.dto';
import { MedicalCenter } from './entities/medical-center.entity';

@Injectable()
export class MedicalCenterService {
  constructor(
    @InjectRepository(MedicalCenter, DatabaseConnectionName.DB_MAIN)
    private readonly medicalCenterRepository: Repository<MedicalCenter>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Método para limpiar cache de paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    const listKey = 'medicalCenter:query:keys';
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];

    for (const key of keys) {
      await this.cacheManager.del(key);
    }

    await this.cacheManager.del(listKey);
  }

  /**
   * Crear centro médico
   */
  async create(dto: CreateMedicalCenterDto): Promise<MedicalCenter> {
    try {
      const existingCenter = await this.medicalCenterRepository.findOne({
        where: { name: dto.name },
      });

      if (existingCenter) {
        throw new BadRequestException('Ya existe un centro médico con ese nombre.');
      }

      const newCenter = this.medicalCenterRepository.create(dto);
      const center = await this.medicalCenterRepository.save(newCenter);

      // Limpiar cache global
      await this.cacheManager.del('medicalCenter:all');
      await this.clearQueryCache();

      return center;
    } catch (error) {
      throw new BadRequestException(
        `Error al crear el centro médico: ${error.message}`,
      );
    }
  }

  /**
   * Listar centros médicos con filtros + paginación + cache
   */
  async findAll(query: MedicalCenterQueryDto) {
    const { page, limit, order, search, isActive } = query;

    const cacheKey = `medicalCenter:query:${JSON.stringify(query)}`;
    const listKey = 'medicalCenter:query:keys';

    // Consultar cache
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    // Construir QueryBuilder
    const qb = this.medicalCenterRepository
      .createQueryBuilder('mc')
      .leftJoinAndSelect('mc.doctors', 'doctors')
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

    qb.orderBy('mc.id', order);
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
   * Obtener centro médico por ID con cache
   */
  async findOne(id: number): Promise<MedicalCenter> {
    const cacheKey = `medicalCenter:${id}`;

    try {
      const cached = await this.cacheManager.get<MedicalCenter>(cacheKey);
      if (cached) return cached;

      const center = await this.medicalCenterRepository.findOne({
        where: { id },
        relations: ['doctors', 'doctors.commonPerson'],
      });

      if (!center) {
        throw new NotFoundException(`Centro médico con ID ${id} no encontrado.`);
      }

      await this.cacheManager.set(cacheKey, center, 600);

      return center;
    } catch (error) {
      throw new NotFoundException(
        `Error al obtener el centro médico: ${error.message}`,
      );
    }
  }

  /**
   * Actualizar centro médico
   */
  async update(id: number, dto: UpdateMedicalCenterDto): Promise<MedicalCenter> {
    try {
      const center = await this.medicalCenterRepository.findOneBy({ id });

      if (!center) {
        throw new NotFoundException(`Centro médico con ID ${id} no encontrado.`);
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
      throw new BadRequestException(
        `Error al actualizar el centro médico: ${error.message}`,
      );
    }
  }

  /**
   * Eliminar centro médico (soft delete)
   */
  async remove(id: number): Promise<void> {
    try {
      const center = await this.medicalCenterRepository.findOneBy({ id });
      if (!center) {
        throw new NotFoundException(`Centro médico con ID ${id} no encontrado.`);
      }

      center.deletedAt = new Date();
      await this.medicalCenterRepository.save(center);

      await this.cacheManager.del(`medicalCenter:${id}`);
      await this.cacheManager.del('medicalCenter:all');
      await this.clearQueryCache();
    } catch (error) {
      throw new NotFoundException(
        `Error al eliminar el centro médico: ${error.message}`,
      );
    }
  }
}
