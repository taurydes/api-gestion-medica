import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { MedicalCenter } from './entities/medical-center.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenterController } from './medical-center.controller';
import { MedicalCenterService } from './medical-center.service';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [MedicalCenter, Doctor],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  controllers: [MedicalCenterController],
  providers: [MedicalCenterService],
  exports: [MedicalCenterService, TypeOrmModule],
})
export class MedicalCenterModule {}
