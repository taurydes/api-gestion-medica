import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { MedicalHistory } from './entities/medical-history.entity';
import { MedicalHistoryService } from './medical-history.service';
import { MedicalHistoryController } from './medical-history.controller';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';

/**
 * Módulo de Historial Médico
 * Gestiona los registros de consultas médicas de los pacientes
 * Incluye funcionalidad de diagnósticos y reseñas médicas
 */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [MedicalHistory, Patient, Doctor, MedicalCenter, Specialty],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  controllers: [MedicalHistoryController],
  providers: [MedicalHistoryService],
  exports: [MedicalHistoryService],
})
export class MedicalHistoryModule {}
