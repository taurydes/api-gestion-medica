import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Kiosko } from '../../entities/kiosko.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Injectable()
export class UpdateKioskoUseCase {
  constructor(
    @InjectRepository(Kiosko,DatabaseConnectionName.DB_MAIN)
    private readonly kioskoRepo: Repository<Kiosko>,
  ) {}

  async execute(id: number, dto: Partial<Kiosko>): Promise<Kiosko> {
    const kiosko = await this.kioskoRepo.findOne({ where: { id } });
    if (!kiosko) throw new NotFoundException('Kiosko not found');

    Object.assign(kiosko, dto);
    kiosko.updatedAt = new Date();

    return await this.kioskoRepo.save(kiosko);
  }
}
