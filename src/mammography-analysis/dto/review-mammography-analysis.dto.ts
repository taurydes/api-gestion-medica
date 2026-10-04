import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { DOCTOR_AGREEMENTS, DoctorAgreement } from '../entities/mammography-analysis.entity';

export class ReviewMammographyAnalysisDto {
  @ApiPropertyOptional({ description: 'Notas u observaciones del médico revisor' })
  @IsOptional()
  @IsString()
  reviewNotes?: string;

  @ApiPropertyOptional({ description: 'Acuerdo del revisor con el modelo (MJ-33)', enum: DOCTOR_AGREEMENTS })
  @IsOptional()
  @IsIn(DOCTOR_AGREEMENTS, { message: 'reviewAgreement debe ser accepted, rejected o uncertain.' })
  reviewAgreement?: DoctorAgreement;
}
