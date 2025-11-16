import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { State } from '../entities/state.entity';
import { StateQueryDto } from '../dto/query/state-query.dto';
import { Like } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Injectable()
export class StateService {
  constructor(
    @InjectRepository(State, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<State>,
  ) {}

  /**
   * @summary Get all states (with pagination)
   */
  async findAll(query: StateQueryDto) {
    const { page, limit, order, description, iso, isActive } = query;

    const where: any = {};
    if (description) where.description = Like(`%${description}%`);
    if (iso) where.iso = Like(`%${iso}%`);
    if (isActive !== undefined) where.isActive = isActive;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { id: order },
      take: limit,
      skip: (page - 1) * limit,
    });

    return { page, limit, total, data };
  }

  /**
   * @summary Get a state by ID
   */
  async findOne(id: number): Promise<State> {
    const entity = await this.repo.findOne({
      where: { id },
    });

    if (!entity) throw new NotFoundException('State not found');

    return entity;
  }

  /**
   * @summary Get a state with its municipalities
   */
  async findWithMunicipalities(id: number): Promise<State> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: ['municipalities'],
    });

    if (!entity) throw new NotFoundException('State not found');

    return entity;
  }
}
