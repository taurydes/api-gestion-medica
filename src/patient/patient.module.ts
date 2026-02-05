import { Module } from '@nestjs/common';
import { PatientService } from './patient.service';
import { PatientController } from './patient.controller';

import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Patient } from './entities/patient.entity';
import { CommonPersonModule } from 'src/common-person/common-person.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Patient], DatabaseConnectionName.DB_MAIN),
    CommonPersonModule,
  ],
  controllers: [PatientController],
  providers: [PatientService],
  exports: [PatientService],
})
export class PatientModule {}
