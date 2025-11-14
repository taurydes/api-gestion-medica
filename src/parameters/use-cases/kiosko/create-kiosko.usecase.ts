import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Kiosko } from '../../entities/kiosko.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

@Injectable()
export class CreateKioskoUseCase {
  constructor(
    @InjectRepository(Kiosko,DatabaseConnectionName.DB_MAIN)
    private readonly kioskoRepo: Repository<Kiosko>,
  ) {}

  async execute(dto: Partial<Kiosko>, userId: number): Promise<Kiosko> {
    const kiosko = this.kioskoRepo.create({
      ...dto,
      userId,
    });

    return await this.kioskoRepo.save(kiosko);
  }
}
