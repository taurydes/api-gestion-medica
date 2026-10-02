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
import { IsNull, Repository } from 'typeorm';
import { CreateMedicationDto } from '../dto/medication/create-medication.dto';
import { UpdateMedicationDto } from '../dto/medication/update-medication.dto';
import { MedicationQueryDto } from '../dto/medication/medication-query.dto';
import { Medication } from '../entities/medication.entity';
import { toHttpException } from 'src/common/exceptions/to-http-exception';

@Injectable()
export class MedicationService {
  constructor(
    @InjectRepository(Medication, DatabaseConnectionName.DB_MAIN)
    private readonly medicationRepository: Repository<Medication>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  private async clearQueryCache(): Promise<void> {
    await invalidateScope(this.cacheManager, 'medication');
    // Recipe details and per-history recipe lists embed the medication
    await invalidateScope(this.cacheManager, 'recipe');
    // Appointment (and patient) views embed this catalog
    await invalidateScope(this.cacheManager, APPOINTMENT_CACHE_SCOPE);
    await invalidateScope(this.cacheManager, 'patient');
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
      throw toHttpException(error, 'Error al crear el medicamento.');
    }
  }

  async findAll(query: MedicationQueryDto) {
    const { page, limit, order, search, isActive } = query;

    const cacheKey = `medication:query:${JSON.stringify(query)}`;

    const cached = await getScoped(this.cacheManager, 'medication', cacheKey);
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

    await setScoped(this.cacheManager, 'medication', cacheKey, result, CACHE_TTL.LIST);

    return result;
  }

  async findOne(id: string): Promise<Medication> {
    const cacheKey = `medication:${id}`;

    const cached = await this.cacheManager.get<Medication>(cacheKey);
    if (cached) return cached;

    const medication = await this.medicationRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!medication) {
      throw new NotFoundException(`Medicamento con ID ${id} no encontrado.`);
    }

    await this.cacheManager.set(cacheKey, medication, CACHE_TTL.DETAIL);
    return medication;
  }

  async update(
    id: string,
    updateDto: UpdateMedicationDto,
  ): Promise<Medication> {
    await this.findOne(id); // 404 if missing

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
    await this.findOne(id); // 404 if missing
    // Only the two flags: findOne may return the cached copy, and saving it would write stale fields back
    await this.medicationRepository.update(id, { deletedAt: new Date(), isActive: false });

    await this.cacheManager.del(`medication:${id}`);
    await this.cacheManager.del('medication:all');
    await this.clearQueryCache();
  }
}
