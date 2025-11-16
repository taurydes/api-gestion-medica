import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { Parish } from '../entities/parish.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { CreateParishDto } from '../dto/create/create-parish.dto';
import { UpdateParishDto } from '../dto/update/update-parish.dto';
import { ParishQueryDto } from '../dto/query/parish-query.dto';

@Injectable()
export class ParishService {
  constructor(
    @InjectRepository(Parish, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<Parish>,
  ) {}

  /**
   * @summary Create a new parish
   */
  async create(dto: CreateParishDto): Promise<Parish> {
    try {
      const entity = this.repo.create({ ...dto });
      return await this.repo.save(entity);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error creating parish: ${error.message}`,
      );
    }
  }

  /**
   * @summary List parishes with pagination & filters
   */
  async findAll(query: ParishQueryDto) {
    const { page, limit, order, description, municipalityId, isActive } = query;

    const where: FindOptionsWhere<Parish> = {};

    if (description) where.description = Like(`%${description}%`);
    if (municipalityId) where.municipalityId = municipalityId;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [items, total] = await this.repo.findAndCount({
      where,
      relations: ['municipality'],
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
   * @summary Find parish by ID
   */
  async findOne(id: number): Promise<Parish> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: ['municipality'],
    });

    if (!entity) throw new NotFoundException('Parish not found');

    return entity;
  }

  /**
   * @summary Update parish by ID
   */
  async update(id: number, dto: UpdateParishDto): Promise<Parish> {
    const entity = await this.findOne(id);

    Object.assign(entity, dto, { updatedAt: new Date() });

    return this.repo.save(entity);
  }

  /**
   * @summary Soft delete parish
   */
  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);

    entity.deletedAt = new Date();
    await this.repo.save(entity);
  }
}
