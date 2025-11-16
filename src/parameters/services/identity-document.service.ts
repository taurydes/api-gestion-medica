import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { IdentityDocument } from '../entities/identity-document.entity';
import { CreateIdentityDocumentDto } from '../dto/create/create-identity-document.dto';
import { UpdateIdentityDocumentDto } from '../dto/update/update-identity-document.dto';

import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { IdentityDocumentQueryDto } from '../dto/query/identity-document-query.dto';

@Injectable()
export class IdentityDocumentService {
  constructor(
    @InjectRepository(IdentityDocument, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<IdentityDocument>,
  ) {}

  /**
   * @summary Create a new identity document
   */
  async create(dto: CreateIdentityDocumentDto): Promise<IdentityDocument> {
    try {
      const entity = this.repo.create({ ...dto });
      return await this.repo.save(entity);
    } catch (error) {
      throw new InternalServerErrorException(
        `Error creating identity document: ${error.message}`,
      );
    }
  }

  /**
   * @summary List identity documents with pagination & filters
   */
  async findAll(query: IdentityDocumentQueryDto) {
    const { page, limit, order, letter, description, isActive } = query;

    const where: FindOptionsWhere<IdentityDocument> = {};

    if (letter) where.letter = Like(`%${letter}%`);
    if (description) where.description = Like(`%${description}%`);
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
   * @summary Find identity document by ID
   */
  async findOne(id: number): Promise<IdentityDocument> {
    const entity = await this.repo.findOne({ where: { id } });

    if (!entity) throw new NotFoundException('Identity document not found');

    return entity;
  }

  /**
   * @summary Update identity document by ID
   */
  async update(
    id: number,
    dto: UpdateIdentityDocumentDto,
  ): Promise<IdentityDocument> {
    const entity = await this.findOne(id);

    Object.assign(entity, dto, { updatedAt: new Date() });

    return this.repo.save(entity);
  }

  /**
   * @summary Soft delete identity document
   */
  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);

    entity.deletedAt = new Date();
    await this.repo.save(entity);
  }
}
