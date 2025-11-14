import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ENTITIES
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { CivilStatus } from './entities/civil-status.entity';
import { Company } from './entities/company.entity';
import { Customer } from './entities/customer.entity';
import { Gender } from './entities/gender.entity';
import { Kiosko } from './entities/kiosko.entity';
import { Municipality } from './entities/municipality.entity';
import { Parish } from './entities/parish.entity';
import { Queue } from './entities/queue.entity';
import { State } from './entities/state.entity';
import { VideoPublicity } from './entities/video-publicy.entity';
import { FindKioskoUseCase } from './use-cases/kiosko/find-kiosko.usecase';
import { ListKioskoUseCase } from './use-cases/kiosko/list-kiosko.usecase';

// SERVICE GENERAL (opcional)
import { ParametersService } from './parameters.service';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        Kiosko,
        State,
        Municipality,
        Parish,
        Queue,
        VideoPublicity,
        Gender,
        CivilStatus,
        Company,
        Customer,
      ],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],

  controllers: [


  ],

  providers: [
    ParametersService,

    // USE CASES - KIOSKO
    FindKioskoUseCase,
    ListKioskoUseCase,

    // ⏳ Aquí se agregan los use cases de cada entidad…
  ],

  exports: [ParametersService, TypeOrmModule],
})
export class ParametersModule {}
