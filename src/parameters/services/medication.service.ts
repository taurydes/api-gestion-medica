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
import { CreateMedicationDto } from '../dto/medication/create-medication.dto';
import { UpdateMedicationDto } from '../dto/medication/update-medication.dto';
import { MedicationQueryDto } from '../dto/medication/medication-query.dto';
import { Medication } from '../entities/medication.entity';

@Injectable()
export class MedicationService {
  constructor(
    @InjectRepository(Medication, DatabaseConnectionName.DB_MAIN)
    private readonly medicationRepository: Repository<Medication>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  private async clearQueryCache(): Promise<void> {
    const listKey = 'medication:query:keys';
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    for (const key of keys) {
      await this.cacheManager.del(key);
    }
    await this.cacheManager.del(listKey);
  }

  async create(createDto: CreateMedicationDto): Promise<Medication> {
    try {
      const existing = await this.medicationRepository.findOne({
        where: { name: createDto.name },
      });

      if (existing) {
        throw new BadRequestException(
          'Ya existe un medicamento con ese nombre.',
        );
      }

      const newMedication = this.medicationRepository.create(createDto);
      const medication = await this.medicationRepository.save(newMedication);

      await this.cacheManager.del('medication:all');
      await this.clearQueryCache();

      return medication;
    } catch (error) {
      throw new BadRequestException(
        `Error al crear el medicamento: ${error.message}`,
      );
    }
  }

  async findAll(query: MedicationQueryDto) {
    const { page, limit, order, search, isActive } = query;

    const cacheKey = `medication:query:${JSON.stringify(query)}`;
    const listKey = 'medication:query:keys';

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const qb = this.medicationRepository
      .createQueryBuilder('medication')
      .where('medication.deletedAt IS NULL');

    if (search) {
      qb.andWhere('medication.name ILIKE :search', { search: `%${search}%` });
    }

    if (isActive !== undefined) {
      qb.andWhere('medication.isActive = :isActive', { isActive });
    }

    qb.orderBy('medication.id', order);
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

  async findOne(id: string): Promise<Medication> {
    const cacheKey = `medication:${id}`;

    const cached = await this.cacheManager.get<Medication>(cacheKey);
    if (cached) return cached;

    const medication = await this.medicationRepository.findOne({
      where: { id },
    });

    if (!medication) {
      throw new NotFoundException(`Medicamento con ID ${id} no encontrado.`);
    }

    await this.cacheManager.set(cacheKey, medication, 600);
    return medication;
  }

  async update(
    id: string,
    updateDto: UpdateMedicationDto,
  ): Promise<Medication> {
    const medication = await this.findOne(id);

    await this.medicationRepository.update(id, updateDto);
    const updated = await this.medicationRepository.findOne({ where: { id } });

    if (!updated) {
      throw new NotFoundException('Error al actualizar el medicamento.');
    }

    await this.cacheManager.del(`medication:${id}`);
    await this.cacheManager.del('medication:all');
    await this.clearQueryCache();

    return updated;
  }

  async remove(id: string): Promise<void> {
    const medication = await this.findOne(id);

    await this.medicationRepository.save({
      ...medication,
      deletedAt: new Date(),
      isActive: false,
    });

    await this.cacheManager.del(`medication:${id}`);
    await this.cacheManager.del('medication:all');
    await this.clearQueryCache();
  }
}
