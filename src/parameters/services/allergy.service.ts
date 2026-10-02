import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { CACHE_TTL } from 'src/common/cache/cache-registry';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Repository } from 'typeorm';
import { CreateAllergyDto } from '../dto/allergy/create-allergy.dto';
import { UpdateAllergyDto } from '../dto/allergy/update-allergy.dto';
import { AllergyQueryDto } from '../dto/allergy/allergy-query.dto';
import { Allergy } from '../entities/allergy.entity';
import { toHttpException } from 'src/common/exceptions/to-http-exception';

@Injectable()
export class AllergyService {
  constructor(
    @InjectRepository(Allergy, DatabaseConnectionName.DB_MAIN)
    private readonly allergyRepository: Repository<Allergy>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  private async clearQueryCache(): Promise<void> {
    const listKey = 'allergy:query:keys';
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    for (const key of keys) {
      await this.cacheManager.del(key);
    }
    await this.cacheManager.del(listKey);
  }

  async create(createAllergyDto: CreateAllergyDto): Promise<Allergy> {
    try {
      const existing = await this.allergyRepository.findOne({
        where: { name: createAllergyDto.name },
      });

      if (existing) {
        throw new BadRequestException('Ya existe una alergia con ese nombre.');
      }

      const newAllergy = this.allergyRepository.create(createAllergyDto);
      const allergy = await this.allergyRepository.save(newAllergy);

      await this.cacheManager.del('allergy:all');
      await this.clearQueryCache();

      return allergy;
    } catch (error) {
      throw toHttpException(error, 'Error al crear la alergia.');
    }
  }

  async findAll(query: AllergyQueryDto) {
    const { page, limit, order, search, isActive } = query;

    const cacheKey = `allergy:query:${JSON.stringify(query)}`;
    const listKey = 'allergy:query:keys';

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const qb = this.allergyRepository
      .createQueryBuilder('allergy')
      .where('allergy.deletedAt IS NULL');

    if (search) {
      qb.andWhere('allergy.name ILIKE :search', { search: `%${search}%` });
    }

    if (isActive !== undefined) {
      qb.andWhere('allergy.isActive = :isActive', { isActive });
    }

    qb.orderBy('allergy.id', order);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const result = { data: items, total, page, limit };

    await this.cacheManager.set(cacheKey, result, CACHE_TTL.LIST);

    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    if (!keys.includes(cacheKey)) {
      keys.push(cacheKey);
      await this.cacheManager.set(listKey, keys, CACHE_TTL.REGISTRY);
    }

    return result;
  }

  async findOne(id: string): Promise<Allergy> {
    const cacheKey = `allergy:${id}`;

    const cached = await this.cacheManager.get<Allergy>(cacheKey);
    if (cached) return cached;

    const allergy = await this.allergyRepository.findOne({ where: { id } });

    if (!allergy) {
      throw new NotFoundException(`Alergia con ID ${id} no encontrada.`);
    }

    await this.cacheManager.set(cacheKey, allergy, CACHE_TTL.DETAIL);
    return allergy;
  }

  async update(
    id: string,
    updateAllergyDto: UpdateAllergyDto,
  ): Promise<Allergy> {
    const allergy = await this.findOne(id);

    await this.allergyRepository.update(id, updateAllergyDto);
    const updated = await this.allergyRepository.findOne({ where: { id } });

    if (!updated) {
      throw new NotFoundException('Error al actualizar la alergia.');
    }

    await this.cacheManager.del(`allergy:${id}`);
    await this.cacheManager.del('allergy:all');
    await this.clearQueryCache();

    return updated;
  }

  async remove(id: string): Promise<void> {
    const allergy = await this.findOne(id);

    await this.allergyRepository.save({
      ...allergy,
      deletedAt: new Date(),
      isActive: false,
    });

    await this.cacheManager.del(`allergy:${id}`);
    await this.cacheManager.del('allergy:all');
    await this.clearQueryCache();
  }
}
