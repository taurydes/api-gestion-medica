import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { Municipality } from '../entities/municipality.entity';
import { CreateMunicipalityDto } from '../dto/create/create-municipality.dto';
import { UpdateMunicipalityDto } from '../dto/update/update-municipality.dto';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { MunicipalityQueryDto } from '../dto/query/municipality-query.dto';

@Injectable()
export class MunicipalityService {
  constructor(
    @InjectRepository(Municipality, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<Municipality>,
  ) {}

  /**
   * @summary Create a new municipality
   */
  async create(dto: CreateMunicipalityDto): Promise<Municipality> {
    try {
      const entity = this.repo.create({ ...dto });
      return await this.repo.save(entity);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error creating municipality: ${error.message}`,
      );
    }
  }

  /**
   * @summary List municipalities with pagination & filters
   */
  async findAll(query: MunicipalityQueryDto) {
    const { page, limit, order, description, stateId, isActive } = query;

    const where: FindOptionsWhere<Municipality> = {};

    if (description) where.description = Like(`%${description}%`);
    if (stateId) where.stateId = stateId;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [items, total] = await this.repo.findAndCount({
      where,
      relations: ['state'],
      take: limit,
      skip: (page - 1) * limit,
      order: { id: order },
    });

    return {
      total,
      page,
      limit,
      data: items,
    };
  }

  /**
   * @summary Find municipality by ID
   */
  async findOne(id: number): Promise<Municipality> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: ['state', 'parishes'],
    });

    if (!entity) {
      throw new NotFoundException('Municipality not found');
    }

    return entity;
  }

  /**
   * @summary Update municipality by ID
   */
  async update(id: number, dto: UpdateMunicipalityDto): Promise<Municipality> {
    const entity = await this.findOne(id);

    Object.assign(entity, dto, { updatedAt: new Date() });

    return this.repo.save(entity);
  }

  /**
   * @summary Soft delete municipality
   */
  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);

    entity.deletedAt = new Date();
    await this.repo.save(entity);
  }
}
