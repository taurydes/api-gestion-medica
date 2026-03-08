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
import { CreateChronicDiseaseDto } from '../dto/chronic-disease/create-chronic-disease.dto';
import { UpdateChronicDiseaseDto } from '../dto/chronic-disease/update-chronic-disease.dto';
import { ChronicDiseaseQueryDto } from '../dto/chronic-disease/chronic-disease-query.dto';
import { ChronicDisease } from '../entities/chronic-disease.entity';

@Injectable()
export class ChronicDiseaseService {
  constructor(
    @InjectRepository(ChronicDisease, DatabaseConnectionName.DB_MAIN)
    private readonly chronicDiseaseRepository: Repository<ChronicDisease>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  private async clearQueryCache(): Promise<void> {
    const listKey = 'chronic-disease:query:keys';
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    for (const key of keys) {
      await this.cacheManager.del(key);
    }
    await this.cacheManager.del(listKey);
  }

  async create(createDto: CreateChronicDiseaseDto): Promise<ChronicDisease> {
    try {
      const existing = await this.chronicDiseaseRepository.findOne({
        where: { name: createDto.name },
      });

      if (existing) {
        throw new BadRequestException(
          'Ya existe una enfermedad crónica con ese nombre.',
        );
      }

      const newDisease = this.chronicDiseaseRepository.create(createDto);
      const disease = await this.chronicDiseaseRepository.save(newDisease);

      await this.cacheManager.del('chronic-disease:all');
      await this.clearQueryCache();

      return disease;
    } catch (error) {
      throw new BadRequestException(
        `Error al crear la enfermedad crónica: ${error.message}`,
      );
    }
  }

  async findAll(query: ChronicDiseaseQueryDto) {
    const { page, limit, order, search, isActive } = query;

    const cacheKey = `chronic-disease:query:${JSON.stringify(query)}`;
    const listKey = 'chronic-disease:query:keys';

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const qb = this.chronicDiseaseRepository
      .createQueryBuilder('disease')
      .where('disease.deletedAt IS NULL');

    if (search) {
      qb.andWhere('disease.name ILIKE :search', { search: `%${search}%` });
    }

    if (isActive !== undefined) {
      qb.andWhere('disease.isActive = :isActive', { isActive });
    }

    qb.orderBy('disease.id', order);
    qb.skip((page - 1) * limit).take(limit);

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

  async findOne(id: string): Promise<ChronicDisease> {
    const cacheKey = `chronic-disease:${id}`;

    const cached = await this.cacheManager.get<ChronicDisease>(cacheKey);
    if (cached) return cached;

    const disease = await this.chronicDiseaseRepository.findOne({
      where: { id },
    });

    if (!disease) {
      throw new NotFoundException(
        `Enfermedad crónica con ID ${id} no encontrada.`,
      );
    }

    await this.cacheManager.set(cacheKey, disease, 600);
    return disease;
  }

  async update(
    id: string,
    updateDto: UpdateChronicDiseaseDto,
  ): Promise<ChronicDisease> {
    const disease = await this.findOne(id);

    await this.chronicDiseaseRepository.update(id, updateDto);
    const updated = await this.chronicDiseaseRepository.findOne({
      where: { id },
    });

    if (!updated) {
      throw new NotFoundException('Error al actualizar la enfermedad crónica.');
    }

    await this.cacheManager.del(`chronic-disease:${id}`);
    await this.cacheManager.del('chronic-disease:all');
    await this.clearQueryCache();

    return updated;
  }

  async remove(id: string): Promise<void> {
    const disease = await this.findOne(id);

    await this.chronicDiseaseRepository.save({
      ...disease,
      deletedAt: new Date(),
      isActive: false,
    });

    await this.cacheManager.del(`chronic-disease:${id}`);
    await this.cacheManager.del('chronic-disease:all');
    await this.clearQueryCache();
  }
}
