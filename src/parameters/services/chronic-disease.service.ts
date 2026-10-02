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
import { CreateChronicDiseaseDto } from '../dto/chronic-disease/create-chronic-disease.dto';
import { UpdateChronicDiseaseDto } from '../dto/chronic-disease/update-chronic-disease.dto';
import { ChronicDiseaseQueryDto } from '../dto/chronic-disease/chronic-disease-query.dto';
import { ChronicDisease } from '../entities/chronic-disease.entity';
import { toHttpException } from 'src/common/exceptions/to-http-exception';

@Injectable()
export class ChronicDiseaseService {
  constructor(
    @InjectRepository(ChronicDisease, DatabaseConnectionName.DB_MAIN)
    private readonly chronicDiseaseRepository: Repository<ChronicDisease>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  private async clearQueryCache(): Promise<void> {
    await invalidateScope(this.cacheManager, 'chronic-disease');
    // Appointment (and patient) views embed this catalog
    await invalidateScope(this.cacheManager, APPOINTMENT_CACHE_SCOPE);
    await invalidateScope(this.cacheManager, 'patient');
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
      throw toHttpException(error, 'Error al crear la enfermedad crónica.');
    }
  }

  async findAll(query: ChronicDiseaseQueryDto) {
    const { page, limit, order, search, isActive } = query;

    const cacheKey = `chronic-disease:query:${JSON.stringify(query)}`;

    const cached = await getScoped(this.cacheManager, 'chronic-disease', cacheKey);
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

    await setScoped(this.cacheManager, 'chronic-disease', cacheKey, result, CACHE_TTL.LIST);

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

    await this.cacheManager.set(cacheKey, disease, CACHE_TTL.DETAIL);
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
