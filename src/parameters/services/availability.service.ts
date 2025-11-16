import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Repository, FindOptionsWhere, Like } from 'typeorm';

import { CreateAvailabilityDto } from '../dto/create/create-availability.dto';
import { UpdateAvailabilityDto } from '../dto/update/update-availability.dto';
import { Availability } from '../entities/availability.entity';
import { AvailabilityPaginationDto } from '../dto/query/availability-query.dto';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(Availability, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<Availability>,
  ) {}

  /**
   * @summary Create a new availability
   */
  async create(dto: CreateAvailabilityDto): Promise<Availability> {
    try {
      const entity = this.repo.create({ ...dto });
      return await this.repo.save(entity);
    } catch (error) {
      throw new InternalServerErrorException('Error creating availability');
    }
  }

  /**
   * @summary Get paginated and filtered list of availabilities
   */
  async findAll(query: AvailabilityPaginationDto) {
    const {
      page = 1,
      limit = 10,
      order = 'ASC',
      description,
      isActive,
    } = query;

    const where: FindOptionsWhere<Availability> = {};

    if (description) {
      where.description = Like(`%${description}%`);
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [data, total] = await this.repo.findAndCount({
      where,
      take: limit,
      skip: (page - 1) * limit,
      order: { id: order },
    });

    return {
      page,
      limit,
      total,
      data,
    };
  }

  /**
   * @summary Find availability by ID
   */
  async findOne(id: number): Promise<Availability> {
    const entity = await this.repo.findOne({ where: { id } });

    if (!entity) throw new NotFoundException('Availability not found');
    return entity;
  }

  /**
   * @summary Update availability by ID
   */
  async update(id: number, dto: UpdateAvailabilityDto): Promise<Availability> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Availability not found');

    Object.assign(entity, dto, { updatedAt: new Date() });

    return await this.repo.save(entity);
  }

  /**
   * @summary Soft delete an availability
   */
  async remove(id: number): Promise<void> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Availability not found');

    entity.deletedAt = new Date();
    await this.repo.save(entity);
  }
}
