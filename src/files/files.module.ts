import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoPublicity } from './entities/video-publicy.entity';
import { AppointmentFile } from './entities/appointment-file.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { MedicalCenterImage } from 'src/medical-center/entities/medical-center-image.entity';
import { DoctorImage } from 'src/doctors/entities/doctor-image.entity';
import { CommonPersonImage } from 'src/common-person/entities/common-person-image.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [VideoPublicity, AppointmentFile, MedicalCenterImage, DoctorImage, CommonPersonImage],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
