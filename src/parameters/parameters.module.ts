import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// DB Connection
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

// ENTITIES (schema: parametro)
import { CivilStatus } from './entities/civil-status.entity';
import { Gender } from './entities/gender.entity';
import { IdentityDocument } from './entities/identity-document.entity';

import { Municipality } from './entities/municipality.entity';
import { Parish } from './entities/parish.entity';
import { State } from './entities/state.entity';

// CONTROLLERS
import { CivilStatusController } from './controllers/civil-status.controller';
import { GenderController } from './controllers/gender.controller';
import { IdentityDocumentController } from './controllers/identity-document.controller';
import { MunicipalityController } from './controllers/municipality.controller';
import { ParishController } from './controllers/parish.controller';
import { StateController } from './controllers/state.controller';
import { CivilStatusService } from './services/civil-status.service';
import { IdentityDocumentService } from './services/identity-document.service';
import { GenderService } from './services/gender.service';
import { MunicipalityService } from './services/municipality.service';
import { StateService } from './services/state.service';
import { ParishService } from './services/parish.service';

// SERVICES


@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        CivilStatus,
        Gender,
        IdentityDocument,
        Municipality,
        Parish,
        State,
      ],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],

  controllers: [
    CivilStatusController,
    GenderController,
    IdentityDocumentController,
    MunicipalityController,
    ParishController,
    StateController,
  ],

  providers: [
    CivilStatusService,
    GenderService,
    IdentityDocumentService,
    MunicipalityService,
    ParishService,
    StateService,
  ],

  exports: [TypeOrmModule],
})
export class ParametersModule {}
