import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Kiosko } from '../../entities/kiosko.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Injectable()
export class DeleteKioskoUseCase {
  constructor(
    @InjectRepository(Kiosko,DatabaseConnectionName.DB_MAIN)
    private readonly kioskoRepo: Repository<Kiosko>,
  ) {}

  async execute(id: number): Promise<void> {
    const kiosko = await this.kioskoRepo.findOne({ where: { id } });
    if (!kiosko) throw new NotFoundException('Kiosko not found');

    kiosko.deletedAt = new Date();
    kiosko.isActive = false;

    await this.kioskoRepo.save(kiosko);
  }
}
