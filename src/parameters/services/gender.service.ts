import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Gender } from '../entities/gender.entity';
import { CreateGenderDto } from '../dto/create/create-gender.dto';
import { UpdateGenderDto } from '../dto/update/update-gender.dto';
import { GenderQueryDto } from '../dto/query/gender-query.dto';

@Injectable()
export class GenderService {
  constructor(
    @InjectRepository(Gender, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<Gender>,
  ) {}

  /**
   * @summary Create gender
   */
  async create(dto: CreateGenderDto): Promise<Gender> {
    try {
      const entity = this.repo.create(dto);
      return await this.repo.save(entity);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error creating gender: ${error.message}`,
      );
    }
  }

  /**
   * @summary List genders with pagination & filters
   */
  async findAll(query: GenderQueryDto) {
    const { page, limit, order, description, acronym, isActive } = query;

    const where: FindOptionsWhere<Gender> = {};

    if (description) where.description = Like(`%${description}%`);
    if (acronym) where.acronym = Like(`%${acronym}%`);
    if (isActive !== undefined) where.isActive = isActive === 'true';

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
   * @summary Find gender by ID
   */
  async findOne(id: string): Promise<Gender> {
    const entity = await this.repo.findOne({ where: { id } });

    if (!entity) throw new NotFoundException('Gender not found');

    return entity;
  }

  /**
   * @summary Update gender
   */
  async update(id: string, dto: UpdateGenderDto): Promise<Gender> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto, { updatedAt: new Date() });
    return this.repo.save(entity);
  }

  /**
   * @summary Soft delete gender
   */
  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    entity.deletedAt = new Date();
    await this.repo.save(entity);
  }
}
