import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// DB Connection
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

// ENTITIES (schema: parametro)
import { Availability } from './entities/availability.entity';
import { CivilStatus } from './entities/civil-status.entity';
import { DayOfWeek } from './entities/day-of-week.entity';
import { Gender } from './entities/gender.entity';
import { IdentityDocument } from './entities/identity-document.entity';
import { Kiosko } from './entities/kiosko.entity';
import { Municipality } from './entities/municipality.entity';
import { Parish } from './entities/parish.entity';
import { Queue } from './entities/queue.entity';
import { ScheduleProgram } from './entities/schedule-program.entity';
import { State } from './entities/state.entity';
import { VideoPublicity } from './entities/video-publicy.entity';

// CONTROLLERS
import { AvailabilityController } from './controllers/availability.controller';
import { CivilStatusController } from './controllers/civil-status.controller';
import { GenderController } from './controllers/gender.controller';
import { IdentityDocumentController } from './controllers/identity-document.controller';
import { KioskoController } from './controllers/kiosko.controller';
import { MunicipalityController } from './controllers/municipality.controller';
import { ParishController } from './controllers/parish.controller';
import { QueueController } from './controllers/queue.controller';
import { StateController } from './controllers/state.controller';

// SERVICES
import { AvailabilityService } from './services/availability.service';
import { CivilStatusService } from './services/civil-status.service';
import { GenderService } from './services/gender.service';
import { IdentityDocumentService } from './services/identity-document.service';
import { KioskoService } from './services/kiosko.service';
import { MunicipalityService } from './services/municipality.service';
import { ParishService } from './services/parish.service';
import { QueueService } from './services/queue.service';
import { StateService } from './services/state.service';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        Availability,
        CivilStatus,
        DayOfWeek,
        Gender,
        IdentityDocument,
        Kiosko,
        Municipality,
        Parish,
        Queue,
        ScheduleProgram,
        State,
        VideoPublicity,
      ],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],

  controllers: [
    AvailabilityController,
    CivilStatusController,
    GenderController,
    IdentityDocumentController,
    KioskoController,
    MunicipalityController,
    ParishController,
    QueueController,
    StateController,
  ],

  providers: [
    AvailabilityService,
    CivilStatusService,
    GenderService,
    IdentityDocumentService,
    KioskoService,
    MunicipalityService,
    ParishService,
    QueueService,
    StateService,
  ],

  exports: [TypeOrmModule],
})
export class ParametersModule {}
