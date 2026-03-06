import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  ValidateNested,
  IsArray,
  IsDateString,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO simplificado para ítems de receta en la finalización de consulta
 */
export class ConsultationRecipeItemInputDto {
  @IsOptional()
  @IsNumber()
  medicationId?: number;

  @IsString()
  @IsNotEmpty({ message: 'El nombre del medicamento es requerido' })
  medicationName: string;

  @IsString()
  @IsNotEmpty({ message: 'La dosis es requerida' })
  dosage: string;

  @IsString()
  @IsNotEmpty({ message: 'La frecuencia es requerida' })
  frequency: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsNumber()
  @IsNotEmpty({ message: 'La cantidad es requerida' })
  quantity: number;
}

/**
 * DTO simplificado para el historial médico en la finalización de consulta
 */
export class ConsultationHistoryInputDto {
  @IsDateString()
  @IsNotEmpty()
  consultationDate: string;

  @IsString()
  @IsNotEmpty()
  reasonForVisit: string;

  @IsOptional()
  @IsString()
  symptoms?: string;

  @IsOptional()
  @IsString()
  physicalExamination?: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsString()
  diagnosisCode?: string;

  @IsOptional()
  @IsString()
  treatmentPlan?: string;

  @IsOptional()
  @IsString()
  bloodPressure?: string;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  heartRate?: number;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  respiratoryRate?: number;

  @IsOptional()
  @IsNumber()
  oxygenSaturation?: number;
}

/**
 * DTO simplificado para la receta médica en la finalización de consulta
 */
export class ConsultationRecipeInputDto {
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsultationRecipeItemInputDto)
  items: ConsultationRecipeItemInputDto[];
}

/**
 * DTO para finalizar una consulta médica completa
 * Incluye la actualización de la cita, creación de historial y recetas opcionales
 */
export class CompleteConsultationDto {
  @ApiPropertyOptional({
    description: 'Notas u observaciones finales de la cita',
    example: 'Paciente estable, se recomienda reposo.',
  })
  @IsOptional()
  @IsString()
  observations?: string;

  @ApiProperty({
    description: 'Datos para crear el historial médico (obligatorio)',
    type: ConsultationHistoryInputDto,
  })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => ConsultationHistoryInputDto)
  medicalHistory: ConsultationHistoryInputDto;

  @ApiPropertyOptional({
    description: 'Datos opcionales para crear una receta médica',
    type: ConsultationRecipeInputDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConsultationRecipeInputDto)
  recipe?: ConsultationRecipeInputDto;
}
