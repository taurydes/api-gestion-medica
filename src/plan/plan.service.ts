import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdvertisingPlan } from './entities/advertising-plan.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { AuthUser } from 'src/auth/interfaces/User';
import { CreateAdvertisingPlanDto } from './dto/create-advertising-plan.dto';
import { UpdateAdvertisingPlanDto } from './dto/update-advertising-plan.dto';

@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(AdvertisingPlan, DatabaseConnectionName.DB_MAIN)
    private readonly planRepository: Repository<AdvertisingPlan>,
  ) {}

  /**
   * @summary Crea un nuevo plan de publicidad.
   * @description
   * Guarda el plan y controla errores por duplicidad del código.
   */
  async create(
    dto: CreateAdvertisingPlanDto,
    user: AuthUser,
  ): Promise<AdvertisingPlan> {
    const newPlan = this.planRepository.create({
      ...dto,
    });

    try {
      return await this.planRepository.save(newPlan);
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
   * @summary Obtiene todos los planes de publicidad registrados.
   */
  async findAll(): Promise<AdvertisingPlan[]> {
    try {
      return await this.planRepository.find();
    } catch (error) {
      throw new InternalServerErrorException(
        `Error retrieving advertising plans: ${error.message}`,
      );
    }
  }

  /**
   * @summary Obtiene un plan por su ID.
   * @throws NotFoundException si no existe.
   */
  async findOne(id: number): Promise<AdvertisingPlan> {
    const plan = await this.planRepository.findOne({ where: { id } });

    if (!plan) {
      throw new NotFoundException(`Advertising plan with ID ${id} not found`);
    }

    return plan;
  }

  /**
   * @summary Actualiza un plan de publicidad.
   */
  async update(
    id: number,
    dto: UpdateAdvertisingPlanDto,
  ): Promise<AdvertisingPlan> {
    const plan = await this.findOne(id);

    Object.assign(plan, dto);

    try {
      return await this.planRepository.save(plan);
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
   * @summary Elimina un plan de publicidad existente.
   */
  async remove(id: number): Promise<void> {
    const plan = await this.findOne(id);

    try {
      await this.planRepository.remove(plan);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error deleting advertising plan: ${error.message}`,
      );
    }
  }
}
