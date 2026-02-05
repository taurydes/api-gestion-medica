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
import { Allergy } from './entities/allergy.entity';
import { ChronicDisease } from './entities/chronic-disease.entity';
import { Medication } from './entities/medication.entity';
import { Specialty } from './entities/specialty.entity';

// CONTROLLERS
import { CivilStatusController } from './controllers/civil-status.controller';
import { GenderController } from './controllers/gender.controller';
import { IdentityDocumentController } from './controllers/identity-document.controller';
import { MunicipalityController } from './controllers/municipality.controller';
import { ParishController } from './controllers/parish.controller';
import { StateController } from './controllers/state.controller';
import { AllergyController } from './controllers/allergy.controller';
import { ChronicDiseaseController } from './controllers/chronic-disease.controller';
import { MedicationController } from './controllers/medication.controller';
import { SpecialtyController } from './controllers/specialty.controller';
import { CivilStatusService } from './services/civil-status.service';
import { IdentityDocumentService } from './services/identity-document.service';
import { GenderService } from './services/gender.service';
import { MunicipalityService } from './services/municipality.service';
import { StateService } from './services/state.service';
import { ParishService } from './services/parish.service';
import { AllergyService } from './services/allergy.service';
import { ChronicDiseaseService } from './services/chronic-disease.service';
import { MedicationService } from './services/medication.service';
import { SpecialtyService } from './services/specialty.service';

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
        Allergy,
        ChronicDisease,
        Medication,
        Specialty,
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
    AllergyController,
    ChronicDiseaseController,
    MedicationController,
    SpecialtyController,
  ],

  providers: [
    CivilStatusService,
    GenderService,
    IdentityDocumentService,
    MunicipalityService,
    ParishService,
    StateService,
    AllergyService,
    ChronicDiseaseService,
    MedicationService,
    SpecialtyService,
  ],

  exports: [TypeOrmModule],
})
export class ParametersModule {}
