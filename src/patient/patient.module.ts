import { Module } from '@nestjs/common';
import { PatientService } from './patient.service';
import { PatientController } from './patient.controller';

import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Patient } from './entities/patient.entity';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { Allergy } from 'src/parameters/entities/allergy.entity';
import { ChronicDisease } from 'src/parameters/entities/chronic-disease.entity';
import { Medication } from 'src/parameters/entities/medication.entity';

/**
 * Módulo de Pacientes
 * Gestiona el CRUD de pacientes con validaciones, caché y relaciones
 */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Patient, CommonPerson, Allergy, ChronicDisease, Medication],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  controllers: [PatientController],
  providers: [PatientService],
  exports: [PatientService],
})
export class PatientModule {}
