import {
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateAvailabilityDto } from '../dto/create-availability.dto';
import { Availability } from '../entities/availability.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { UpdateAvailabilityDto } from '../dto/update-availability.dto';


@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(Availability,DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<Availability>,
  ) {}

  /**
   * @summary Create a new availability
   */
  async create(
    dto: CreateAvailabilityDto,
  ): Promise<Availability> {
    try {
      const entity = this.repo.create({ ...dto});
      const saved = await this.repo.save(entity);

      return saved;
    } catch (error) {
      throw new InternalServerErrorException('Error creating availability');
    }
  }

  /**
   * @summary List all availabilities
   */
  async findAll(): Promise<Availability[]> {
    const items = await this.repo.find({
      order: { id: 'DESC' },
    });

    return items;
  }

  /**
   * @summary Find availability by ID
   */
  async findOne(id: number): Promise<Availability> {
    const entity = await this.repo.findOne({ where: { id} });

    if (!entity) throw new NotFoundException('Availability not found');

    return entity;
  }

  /**
   * @summary Update availability by ID
   */
  async update(
    id: number,
    dto: UpdateAvailabilityDto,
  ): Promise<Availability> {
    const entity = await this.repo.findOne({ where: { id } });

    if (!entity) throw new NotFoundException('Availability not found');

    Object.assign(entity, dto, { updatedAt: new Date() });

    const saved = await this.repo.save(entity);

    return saved;
  }

  /**
   * @summary Soft delete an availability
   */
  async remove(id: number): Promise<void> {
    const entity = await this.repo.findOne({ where: { id } });

    if (!entity) throw new NotFoundException('Availability not found');

    entity.deletedAt = new Date();
    await this.repo.save(entity);;
  }
}
