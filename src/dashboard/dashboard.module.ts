import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Recipe } from 'src/recipe/entities/recipe.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { User } from 'src/user/entities/user.entity';
import { AppointmentFile } from 'src/files/entities/appointment-file.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';


@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        MedicalAppointment,
        Patient,
        Doctor,
        MedicalCenter,
        Department,
        Recipe,
        MedicalHistory,
        User,
        AppointmentFile,
      ],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
