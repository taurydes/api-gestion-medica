import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Doctor } from './entities/doctor.entity';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { CommonPersonModule } from 'src/common-person/common-person.module';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { Department } from 'src/departments/entities/department.entity';
import { DoctorSchedule } from './entities/doctor-schedule.entity';
import { DoctorScheduleService } from './doctor-schedule.service';
import { DoctorImage } from './entities/doctor-image.entity';
import { User } from 'src/user/entities/user.entity';
import { FilesModule } from 'src/files/files.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Doctor, CommonPerson, MedicalCenter, Specialty, Department, DoctorSchedule, DoctorImage, User],
      DatabaseConnectionName.DB_MAIN,
    ),
    CommonPersonModule,
    FilesModule,
  ],
  controllers: [DoctorsController],
  providers: [DoctorsService, DoctorScheduleService],
  exports: [DoctorsService, DoctorScheduleService, TypeOrmModule],
})
export class DoctorsModule {}
