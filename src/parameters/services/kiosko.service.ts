import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Like } from 'typeorm';
import { KioskoQueryDto } from '../dto/query/kiosko-query.dto';
import { Kiosko } from '../entities/kiosko.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Injectable()
export class KioskoService {
  constructor(
    @InjectRepository(Kiosko,DatabaseConnectionName.DB_MAIN)
    private readonly kioskoRepository: Repository<Kiosko>,
  ) {}

  /**
   * @summary Lista de kioskos con paginación
   */
  async findAll(query: KioskoQueryDto) {
    try {
      const { page, limit, order, code, name, isActive } = query;

      const where: any = {};
      if (code) where.code = Like(`%${code}%`);
      if (name) where.name = Like(`%${name}%`);
      if (isActive !== undefined) where.isActive = isActive;

      const [data, total] = await this.kioskoRepository.findAndCount({
        where,
        take: limit,
        skip: (page - 1) * limit,
        order: { id: order },
      });

      return { page, limit, total, data };
    } catch (error) {
      throw new InternalServerErrorException(
        `Error obteniendo lista de kioskos: ${error.message}`,
      );
    }
  }

  /**
   * @summary Obtiene un kiosko por ID
   */
  async findOne(id: number) {
    const kiosko = await this.kioskoRepository.findOne({ where: { id } });

    if (!kiosko) {
      throw new NotFoundException(`Kiosko con ID ${id} no existe`);
    }

    return kiosko;
  }
}
