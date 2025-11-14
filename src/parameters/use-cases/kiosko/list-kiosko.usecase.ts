import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Kiosko } from '../../entities/kiosko.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Injectable()
export class ListKioskoUseCase {
  constructor(
    @InjectRepository(Kiosko,DatabaseConnectionName.DB_MAIN)
    private readonly kioskoRepo: Repository<Kiosko>,
  ) {}

  async execute(): Promise<Kiosko[]> {
    return await this.kioskoRepo.find({
      order: { id: 'DESC' },
    });
  }
}
