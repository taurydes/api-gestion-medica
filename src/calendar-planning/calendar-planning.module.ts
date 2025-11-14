import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Availability } from './entities/availability.entity';
import { AvailabilityService } from './services/availability.service';
import { AvailabilityController } from './controllers/availability.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Availability],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],

  controllers: [AvailabilityController],

  providers: [AvailabilityService],

  exports: [AvailabilityService],
})
export class CalendarPlanningModule {}
