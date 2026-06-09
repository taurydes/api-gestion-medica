import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';

import { MammographyAnalysis } from './entities/mammography-analysis.entity';
import { MammographyAnalysisService } from './mammography-analysis.service';
import { MammographyAnalysisController } from './mammography-analysis.controller';
import { AppointmentFile } from 'src/files/entities/appointment-file.entity';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [MammographyAnalysis, AppointmentFile, MedicalAppointment],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  controllers: [MammographyAnalysisController],
  providers: [MammographyAnalysisService],
  exports: [MammographyAnalysisService],
})
export class MammographyAnalysisModule {}
