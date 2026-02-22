import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { MedicalAppointment } from './entities/medical-appointment.entity';
import { MedicalAppointmentsController } from './medical-appointments.controller';
import { MedicalAppointmentsService } from './medical-appointments.service';
import { Patient } from 'src/patient/entities/patient.entity';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Allergy } from 'src/parameters/entities/allergy.entity';
import { ChronicDisease } from 'src/parameters/entities/chronic-disease.entity';
import { Medication } from 'src/parameters/entities/medication.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        MedicalAppointment,
        Patient,
        CommonPerson,
        Doctor,
        Specialty,
        MedicalCenter,
        Department,
        Allergy,
        ChronicDisease,
        Medication,
      ],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  controllers: [MedicalAppointmentsController],
  providers: [MedicalAppointmentsService],
  exports: [MedicalAppointmentsService, TypeOrmModule],
})
export class MedicalAppointmentsModule {}
