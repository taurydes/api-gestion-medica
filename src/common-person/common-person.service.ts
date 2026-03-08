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
import { CreateCommonPersonDto } from './dto/create-common-person.dto';
import { CommonPersonQueryDto } from './dto/common-person-query.dto';
import { UpdateCommonPersonDto } from './dto/update-common-person.dto';
import { CommonPerson } from './entities/common-person.entity';

@Injectable()
export class CommonPersonService {
  constructor(
    @InjectRepository(CommonPerson, DatabaseConnectionName.DB_MAIN)
    private readonly commonPersonRepository: Repository<CommonPerson>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * 🔥 Método para limpiar cache de paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    const listKey = 'common-person:query:keys';

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
   * Crear persona común
   */
  async create(
    createCommonPersonDto: CreateCommonPersonDto,
  ): Promise<CommonPerson> {
    try {
      const { documentNumber } = createCommonPersonDto;

      if (documentNumber) {
        const existingPerson = await this.commonPersonRepository.findOne({
          where: { documentNumber },
        });

        if (existingPerson) {
          throw new BadRequestException(
            'El número de documento ya está registrado.',
          );
        }
      }

      const newPerson = this.commonPersonRepository.create(
        createCommonPersonDto,
      );
      const person = await this.commonPersonRepository.save(newPerson);

      // 🧹 limpiar cache global
      await this.cacheManager.del('commonPerson:all');
      await this.clearQueryCache();

      return person;
    } catch (error) {
      throw new BadRequestException(
        `Error al crear la persona: ${error.message}`,
      );
    }
  }

  /**
   * Listar personas con filtros + paginación + cache
   */
  async findAll(
    query: CommonPersonQueryDto,
  ): Promise<{
    data: CommonPerson[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page, limit, order, search, status } = query;

    // 🔑 Key única para esta consulta
    const cacheKey = `commonPerson:query:${JSON.stringify(query)}`;

    // 📌 Key donde guardamos TODAS las keys usadas por findAll
    const listKey = 'common-person:query:keys';

    // 1️⃣ Consultar cache
    const cached = await this.cacheManager.get(cacheKey);
    // if (cached) return cached;

    // 2️⃣ Construir QueryBuilder
    const qb = this.commonPersonRepository
      .createQueryBuilder('commonPerson')
      .leftJoinAndSelect('commonPerson.identityDocument', 'identityDocument')
      .where('commonPerson.deletedAt IS NULL');

    // 🔍 Filtros
    if (search) {
      qb.andWhere(
        '(commonPerson.firstName ILIKE :search OR commonPerson.lastName ILIKE :search OR commonPerson.documentNumber ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status !== undefined) {
      qb.andWhere('commonPerson.isActive = :status', { status });
    }

    qb.orderBy('commonPerson.id', order);
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
   * Obtener persona por ID con cache
   */
  async findOne(id: string): Promise<CommonPerson> {
    const cacheKey = `commonPerson:${id}`;

    const cached = await this.cacheManager.get<CommonPerson>(cacheKey);
    if (cached) return cached;

    const person = await this.commonPersonRepository.findOne({
      where: { id },
      relations: ['identityDocument'],
    });

    if (!person) {
      throw new NotFoundException(`Persona con ID ${id} no encontrada.`);
    }

    await this.cacheManager.set(cacheKey, person, 600);
    return person;
  }

  /**
   * Actualizar persona
   */
  async update(
    id: string,
    updateCommonPersonDto: UpdateCommonPersonDto,
  ): Promise<CommonPerson> {
    const person = await this.findOne(id); // Checks existence

    await this.commonPersonRepository.update(id, updateCommonPersonDto);
    const updated = await this.commonPersonRepository.findOne({
      where: { id },
      relations: ['identityDocument'],
    });

    if (!updated) {
      throw new NotFoundException('Error al actualizar la persona.');
    }

    // limpiar caches
    await this.cacheManager.del(`commonPerson:${id}`);
    await this.cacheManager.del('commonPerson:all');
    await this.clearQueryCache();

    return updated;
  }

  /**
   * Eliminar persona
   */
  async remove(id: string): Promise<void> {
    const person = await this.findOne(id); // Checks existence

    await this.commonPersonRepository.save({
      ...person,
      deletedAt: new Date(),
      isActive: false,
    });
    // Or softDelete if configured in entity, but we are doing manual soft delete updates or using TypeORM softDelete
    // The entity has @Column deleted_at, so we can use softDelete if we want, or manual update like above.
    // Let's use softRemove or just update the field to be safe with existing logic patterns.
    // Given 'deletedAt' is a column, I'll assume standard TypeORM soft delete can be used or manual.
    // The query builder check 'deletedAt IS NULL' implies soft delete logic.

    await this.cacheManager.del(`commonPerson:${id}`);
    await this.cacheManager.del('commonPerson:all');
    await this.clearQueryCache();
  }
}
