import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { MedicalCenter } from './entities/medical-center.entity';
import { MedicalCenterImage } from './entities/medical-center-image.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenterController } from './medical-center.controller';
import { MedicalCenterService } from './medical-center.service';
import { Department } from 'src/departments/entities/department.entity';
import { User } from 'src/user/entities/user.entity';
import { FilesModule } from 'src/files/files.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [MedicalCenter, MedicalCenterImage, Doctor, Department, User],
      DatabaseConnectionName.DB_MAIN,
    ),
    FilesModule,
  ],
  controllers: [MedicalCenterController],
  providers: [MedicalCenterService],
  exports: [MedicalCenterService, TypeOrmModule],
})
export class MedicalCenterModule {}
