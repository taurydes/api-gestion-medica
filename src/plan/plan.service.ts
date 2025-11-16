import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

import { AdvertisingPlan } from './entities/advertising-plan.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { AuthUser } from 'src/auth/interfaces/User';
import { CreateAdvertisingPlanDto } from './dto/create-advertising-plan.dto';
import { UpdateAdvertisingPlanDto } from './dto/update-advertising-plan.dto';
import { AdvertisingPlanQueryDto } from './dto/advertising-plan-query.dto';


@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(AdvertisingPlan, DatabaseConnectionName.DB_MAIN)
    private readonly planRepository: Repository<AdvertisingPlan>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * 🔥 Limpieza ordenada del cache de paginación
   */
  private async clearQueryCache(): Promise<void> {
    const listKey = 'plans:query:keys';

    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];

    for (const key of keys) {
      await this.cacheManager.del(key);
    }

    await this.cacheManager.del(listKey);
  }

  /**
   * Crear plan
   */
  async create(
    dto: CreateAdvertisingPlanDto,
    user: AuthUser,
  ): Promise<AdvertisingPlan> {
    const newPlan = this.planRepository.create({
      ...dto,
    });

    try {
      const saved = await this.planRepository.save(newPlan);

      await this.cacheManager.del('plans:all');
      await this.clearQueryCache();

      return saved;
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException('Advertising plan code already exists');
      }
      throw new InternalServerErrorException(
        `Error creating advertising plan: ${error.message}`,
      );
    }
  }

  /**
   * Listar planes con filtros + paginación + redis
   */
  async findAll(query: AdvertisingPlanQueryDto) {
    const { page, limit, order, search, isActive } = query;

    const cacheKey = `plans:query:${JSON.stringify(query)}`;
    const listKey = 'plans:query:keys';

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const qb = this.planRepository
      .createQueryBuilder('plan')
      .where('plan.deletedAt IS NULL');

    // 🔍 Filtros

    if (search) {
      qb.andWhere(
        '(plan.name ILIKE :search OR plan.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (isActive !== undefined) {
      qb.andWhere('plan.isActive = :isActive', { isActive });
    }

    qb.orderBy('plan.id', order);
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

  /**
   * Obtener plan
   */
  async findOne(id: number): Promise<AdvertisingPlan> {
    const cacheKey = `plan:${id}`;

    const cached = await this.cacheManager.get<AdvertisingPlan>(cacheKey);
    if (cached) return cached;

    const plan = await this.planRepository.findOne({ where: { id } });

    if (!plan) {
      throw new NotFoundException(`Advertising plan with ID ${id} not found`);
    }

    await this.cacheManager.set(cacheKey, plan, 600);

    return plan;
  }

  /**
   * Actualizar plan
   */
  async update(
    id: number,
    dto: UpdateAdvertisingPlanDto,
  ): Promise<AdvertisingPlan> {
    const plan = await this.findOne(id);

    Object.assign(plan, dto);

    try {
      const updated = await this.planRepository.save(plan);

      await this.cacheManager.del(`plan:${id}`);
      await this.cacheManager.del('plans:all');
      await this.clearQueryCache();

      return updated;
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException('Advertising plan code already exists');
      }

      throw new InternalServerErrorException(
        `Error updating advertising plan: ${error.message}`,
      );
    }
  }

  /**
   * Eliminar plan
   */
  async remove(id: number): Promise<void> {
    const plan = await this.findOne(id);

    try {
      await this.planRepository.remove(plan);

      await this.cacheManager.del(`plan:${id}`);
      await this.cacheManager.del('plans:all');
      await this.clearQueryCache();
    } catch (error) {
      throw new InternalServerErrorException(
        `Error deleting advertising plan: ${error.message}`,
      );
    }
  }
}
