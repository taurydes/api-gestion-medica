import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MammographyAnalysisPrediction,
  MammographyAnalysisStatus,
} from '../entities/mammography-analysis.entity';

/**
 * DTO para registrar un análisis ML de mamografía.
 *
 * Se envía como multipart/form-data:
 *  - `file`: la imagen analizada (PNG/JPG, incluso si vino de DICOM ya convertido).
 *  - Resto de campos en el body (todos en string en el wire, validados aquí).
 */
export class CreateMammographyAnalysisDto {
  @ApiProperty({ enum: MammographyAnalysisPrediction })
  @IsEnum(MammographyAnalysisPrediction)
  prediction: MammographyAnalysisPrediction;

  @ApiProperty({ description: 'Probabilidad de malignidad (0-100)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  probability: number;

  @ApiProperty({ enum: MammographyAnalysisStatus })
  @IsEnum(MammographyAnalysisStatus)
  status: MammographyAnalysisStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ description: 'Respuesta cruda del servicio ML en JSON' })
  @IsOptional()
  @IsString()
  rawResponseJson?: string;

  @ApiPropertyOptional({ description: 'UUID de la cita médica asociada' })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional({
    description:
      'UUID del archivo de cita (appointment_files) si el análisis viene de un archivo ya almacenado.',
  })
  @IsOptional()
  @IsUUID()
  appointmentFileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Nombre original del archivo cargado por el usuario (ej: study.dcm)',
  })
  @IsOptional()
  @IsString()
  sourceFileName?: string;
}
