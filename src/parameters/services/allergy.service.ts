import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import {
  APPOINTMENT_CACHE_SCOPE,
  CACHE_TTL,
  getScoped,
  invalidateScope,
  setScoped,
} from 'src/common/cache/cache-registry';
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
    await invalidateScope(this.cacheManager, 'allergy');
    // Appointment (and patient) views embed this catalog
    await invalidateScope(this.cacheManager, APPOINTMENT_CACHE_SCOPE);
    await invalidateScope(this.cacheManager, 'patient');
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

    const cached = await getScoped(this.cacheManager, 'allergy', cacheKey);
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

    await setScoped(this.cacheManager, 'allergy', cacheKey, result, CACHE_TTL.LIST);

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
    await this.findOne(id); // 404 if missing

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
    await this.findOne(id); // 404 if missing
    // Only the two flags: findOne may return the cached copy, and saving it would write stale fields back
    await this.allergyRepository.update(id, { deletedAt: new Date(), isActive: false });

    await this.cacheManager.del(`allergy:${id}`);
    await this.cacheManager.del('allergy:all');
    await this.clearQueryCache();
  }
}
