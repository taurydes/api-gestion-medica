import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from '../entities/queue.entity';
import { CreateQueueDto } from '../dto/create/create-queue.dto';
import { UpdateQueueDto } from '../dto/update/update-queue.dto';
import { QueueQueryDto } from '../dto/query/queue-query.dto';
import { Like } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Injectable()
export class QueueService {
  constructor(
    @InjectRepository(Queue, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<Queue>,
  ) {}

  /**
   * @summary Create a new queue
   */
  async create(dto: CreateQueueDto): Promise<Queue> {
    try {
      const entity = this.repo.create({ ...dto });
      return await this.repo.save(entity);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error creating queue: ${error.message}`,
      );
    }
  }

  /**
   * @summary List all queues
   */
  async findAll(query: QueueQueryDto) {
    const { page, limit, order, name, isActive, companyId } = query;

    const where: any = {};
    if (name) where.name = Like(`%${name}%`);
    if (isActive !== undefined) where.isActive = isActive;
    if (companyId !== undefined) where.companyId = companyId;

    const [data, total] = await this.repo.findAndCount({
      where,
      take: limit,
      skip: (page - 1) * limit,
      order: { id: order },
    });

    return { page, limit, total, data };
  }

  /**
   * @summary Find queue by ID
   */
  async findOne(id: number): Promise<Queue> {
    const entity = await this.repo.findOne({ where: { id } });

    if (!entity) throw new NotFoundException('Queue not found');

    return entity;
  }

  /**
   * @summary Update a queue by ID
   */
  async update(id: number, dto: UpdateQueueDto): Promise<Queue> {
    const entity = await this.findOne(id);

    Object.assign(entity, dto, { updatedAt: new Date() });

    return await this.repo.save(entity);
  }

  /**
   * @summary Soft delete queue
   */
  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);

    entity.deletedAt = new Date();
    await this.repo.save(entity);
  }
}
