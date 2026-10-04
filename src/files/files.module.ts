import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { DicomConverterService } from './dicom-converter.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoPublicity } from './entities/video-publicy.entity';
import { AppointmentFile } from './entities/appointment-file.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { MedicalCenterImage } from 'src/medical-center/entities/medical-center-image.entity';
import { DoctorImage } from 'src/doctors/entities/doctor-image.entity';
import { CommonPersonImage } from 'src/common-person/entities/common-person-image.entity';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { CommonModule } from 'src/common/common.module';
import { AppointmentUploadTargetService } from './appointment-upload-target.service';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature(
      [VideoPublicity, AppointmentFile, MedicalCenterImage, DoctorImage, CommonPersonImage, MedicalAppointment, MedicalHistory],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  controllers: [FilesController],
  providers: [FilesService, DicomConverterService, AppointmentUploadTargetService],
  exports: [FilesService, DicomConverterService],
})
export class FilesModule {}
