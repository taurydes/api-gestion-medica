import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { CivilStatus } from '../entities/civil-status.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { CreateCivilStatusDto } from '../dto/create/create-civil-status.dto';
import { UpdateCivilStatusDto } from '../dto/update/update-civil-status.dto';
import { CivilStatusQueryDto } from '../dto/query/civil-status-query.dto';


@Injectable()
export class CivilStatusService {
  constructor(
    @InjectRepository(CivilStatus, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<CivilStatus>,
  ) {}

  /**
   * @summary Create a new civil status
   */
  async create(dto: CreateCivilStatusDto): Promise<CivilStatus> {
    try {
      const entity = this.repo.create(dto);
      return await this.repo.save(entity);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error creating civil status: ${error.message}`,
      );
    }
  }

  /**
   * @summary Paginated and filtered list of civil status records
   */
  async findAll(query: CivilStatusQueryDto) {
    const { page, limit, order, description, isActive } = query;

    const where: FindOptionsWhere<CivilStatus> = {};

    if (description) {
      where.description = Like(`%${description}%`);
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [items, total] = await this.repo.findAndCount({
      where,
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
   * @summary Find civil status by ID
   */
  async findOne(id: number): Promise<CivilStatus> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Civil status not found');
    return entity;
  }

  /**
   * @summary Update civil status by ID
   */
  async update(id: number, dto: UpdateCivilStatusDto): Promise<CivilStatus> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto, { updatedAt: new Date() });
    return await this.repo.save(entity);
  }

  /**
   * @summary Soft delete civil status
   */
  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);
    entity.deletedAt = new Date();
    await this.repo.save(entity);
  }
}
