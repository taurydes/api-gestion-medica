import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

import { MammographyAnalysis } from './entities/mammography-analysis.entity';
import { MammographyAnalysisService } from './mammography-analysis.service';
import { MammographyAnalysisController } from './mammography-analysis.controller';
import { AppointmentFile } from 'src/files/entities/appointment-file.entity';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';
import { User } from 'src/user/entities/user.entity';
import { DetectorClient } from './detector/detector.client';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature(
      [MammographyAnalysis, AppointmentFile, MedicalAppointment, User],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  controllers: [MammographyAnalysisController],
  providers: [MammographyAnalysisService, DetectorClient],
  exports: [MammographyAnalysisService],
})
export class MammographyAnalysisModule {}
