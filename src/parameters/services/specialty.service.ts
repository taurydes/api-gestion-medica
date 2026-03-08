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
import { Specialty } from '../entities/specialty.entity';
import { CreateSpecialtyDto } from '../dto/specialty/create-specialty.dto';
import { UpdateSpecialtyDto } from '../dto/specialty/update-specialty.dto';
import { SpecialtyQueryDto } from '../dto/specialty/specialty-query.dto';

/**
 * Servicio para gestionar las especialidades médicas
 * Incluye CRUD completo con caché Redis y soft delete
 */
@Injectable()
export class SpecialtyService {
  constructor(
    @InjectRepository(Specialty, DatabaseConnectionName.DB_MAIN)
    private readonly specialtyRepository: Repository<Specialty>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * 🔥 Método para limpiar cache de paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    const listKey = 'specialty:query:keys';

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
   * Crear una nueva especialidad médica
   * @param createSpecialtyDto - Datos de la especialidad a crear
   * @returns Especialidad creada
   */
  async create(createSpecialtyDto: CreateSpecialtyDto): Promise<Specialty> {
    try {
      // Verificar si ya existe una especialidad con el mismo nombre
      const existingByName = await this.specialtyRepository.findOne({
        where: { name: createSpecialtyDto.name },
      });

      if (existingByName) {
        throw new BadRequestException(
          `Ya existe una especialidad con el nombre "${createSpecialtyDto.name}".`,
        );
      }

      // Verificar si ya existe una especialidad con el mismo código
      if (createSpecialtyDto.code) {
        const existingByCode = await this.specialtyRepository.findOne({
          where: { code: createSpecialtyDto.code },
        });

        if (existingByCode) {
          throw new BadRequestException(
            `Ya existe una especialidad con el código "${createSpecialtyDto.code}".`,
          );
        }
      }

      const newSpecialty = this.specialtyRepository.create(createSpecialtyDto);
      const specialty = await this.specialtyRepository.save(newSpecialty);

      // 🧹 Limpiar cache global
      await this.cacheManager.del('specialty:all');
      await this.clearQueryCache();

      return specialty;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Error al crear la especialidad: ${error.message}`,
      );
    }
  }

  /**
   * Listar especialidades con filtros + paginación + cache
   * @param query - Parámetros de búsqueda y paginación
   * @returns Lista paginada de especialidades
   */
  async findAll(query: SpecialtyQueryDto) {
    const { page, limit, order, search, isActive } = query;

    // 🔑 Key única para esta consulta
    const cacheKey = `specialty:query:${JSON.stringify(query)}`;

    // 📌 Key donde guardamos TODAS las keys usadas por findAll
    const listKey = 'specialty:query:keys';

    // 1️⃣ Consultar cache
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    // 2️⃣ Construir QueryBuilder
    const qb = this.specialtyRepository
      .createQueryBuilder('specialty')
      .where('specialty.deletedAt IS NULL');

    // 🔍 Filtros
    if (search) {
      qb.andWhere(
        '(specialty.name ILIKE :search OR specialty.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (isActive !== undefined) {
      qb.andWhere('specialty.isActive = :isActive', { isActive });
    }

    qb.orderBy('specialty.id', order);
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
   * Obtener una especialidad por ID con cache
   * @param id - ID de la especialidad
   * @returns Especialidad encontrada
   */
  async findOne(id: string): Promise<Specialty> {
    const cacheKey = `specialty:${id}`;

    try {
      // Consultar cache
      const cached = await this.cacheManager.get<Specialty>(cacheKey);
      if (cached) return cached;

      const specialty = await this.specialtyRepository.findOne({
        where: { id },
      });

      if (!specialty) {
        throw new NotFoundException(
          `Especialidad con ID ${id} no encontrada.`,
        );
      }

      // Guardar en cache por 10 min
      await this.cacheManager.set(cacheKey, specialty, 600);

      return specialty;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException(
        `Error al obtener la especialidad: ${error.message}`,
      );
    }
  }

  /**
   * Actualizar una especialidad existente
   * @param id - ID de la especialidad
   * @param updateSpecialtyDto - Datos a actualizar
   * @returns Especialidad actualizada
   */
  async update(
    id: string,
    updateSpecialtyDto: UpdateSpecialtyDto,
  ): Promise<Specialty> {
    try {
      const specialty = await this.specialtyRepository.findOne({
        where: { id },
      });

      if (!specialty) {
        throw new NotFoundException(
          `Especialidad con ID ${id} no encontrada.`,
        );
      }

      // Verificar nombre duplicado si se está actualizando
      if (updateSpecialtyDto.name && updateSpecialtyDto.name !== specialty.name) {
        const existingByName = await this.specialtyRepository.findOne({
          where: { name: updateSpecialtyDto.name },
        });

        if (existingByName && existingByName.id !== id) {
          throw new BadRequestException(
            `Ya existe una especialidad con el nombre "${updateSpecialtyDto.name}".`,
          );
        }
      }

      // Verificar código duplicado si se está actualizando
      if (updateSpecialtyDto.code && updateSpecialtyDto.code !== specialty.code) {
        const existingByCode = await this.specialtyRepository.findOne({
          where: { code: updateSpecialtyDto.code },
        });

        if (existingByCode && existingByCode.id !== id) {
          throw new BadRequestException(
            `Ya existe una especialidad con el código "${updateSpecialtyDto.code}".`,
          );
        }
      }

      await this.specialtyRepository.update(id, updateSpecialtyDto);

      const updated = await this.specialtyRepository.findOneBy({ id });

      if (!updated) {
        throw new NotFoundException('Error al actualizar la especialidad.');
      }

      // 🧹 Limpiar caches
      await this.cacheManager.del(`specialty:${id}`);
      await this.cacheManager.del('specialty:all');
      await this.clearQueryCache();

      return updated;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Error al actualizar la especialidad: ${error.message}`,
      );
    }
  }

  /**
   * Eliminar una especialidad (soft delete)
   * @param id - ID de la especialidad a eliminar
   */
  async remove(id: string): Promise<void> {
    try {
      const specialty = await this.findOne(id);

      if (!specialty) {
        throw new NotFoundException(
          `Especialidad con ID ${id} no encontrada.`,
        );
      }

      // Soft delete: establecer deletedAt
      await this.specialtyRepository.update(id, {
        deletedAt: new Date(),
        isActive: false,
      });

      // 🧹 Limpiar caches
      await this.cacheManager.del(`specialty:${id}`);
      await this.cacheManager.del('specialty:all');
      await this.clearQueryCache();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException(
        `Error al eliminar la especialidad: ${error.message}`,
      );
    }
  }
}
