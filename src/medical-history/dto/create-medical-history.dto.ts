import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsString,
  IsDateString,
  MaxLength,
} from 'class-validator';

/**
 * DTO para crear un nuevo registro de historial médico (consulta)
 */
export class CreateMedicalHistoryDto {
  @ApiProperty({
    description: 'ID del paciente',
    example: 1,
  })
  @IsNumber()
  @IsNotEmpty({ message: 'El ID del paciente es requerido' })
  patientId: number;

  @ApiProperty({
    description: 'ID del doctor que atiende',
    example: 1,
  })
  @IsNumber()
  @IsNotEmpty({ message: 'El ID del doctor es requerido' })
  doctorId: number;

  @ApiPropertyOptional({
    description: 'ID del centro médico donde se realiza la consulta',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  medicalCenterId?: number;

  @ApiPropertyOptional({
    description: 'ID de la especialidad bajo la cual se atiende',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  specialtyId?: number;

  @ApiProperty({
    description: 'Fecha y hora de la consulta',
    example: '2026-02-04T10:00:00.000Z',
  })
  @IsDateString()
  @IsNotEmpty({ message: 'La fecha de consulta es requerida' })
  consultationDate: string;

  @ApiProperty({
    description: 'Motivo de la consulta',
    example: 'Dolor de cabeza persistente durante 3 días',
  })
  @IsString()
  @IsNotEmpty({ message: 'El motivo de la consulta es requerido' })
  reasonForVisit: string;

  @ApiPropertyOptional({
    description: 'Síntomas presentados por el paciente',
    example: 'Dolor de cabeza, mareos, náuseas',
  })
  @IsOptional()
  @IsString()
  symptoms?: string;

  @ApiPropertyOptional({
    description: 'Resultados del examen físico',
    example: 'Paciente lúcido, orientado en tiempo y espacio',
  })
  @IsOptional()
  @IsString()
  physicalExamination?: string;

  // ========== SIGNOS VITALES ==========

  @ApiPropertyOptional({
    description: 'Presión arterial (ej: 120/80)',
    example: '120/80',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloodPressure?: string;

  @ApiPropertyOptional({
    description: 'Frecuencia cardíaca (ppm)',
    example: 72,
  })
  @IsOptional()
  @IsNumber()
  heartRate?: number;

  @ApiPropertyOptional({
    description: 'Temperatura corporal (°C)',
    example: 36.5,
  })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({
    description: 'Peso (kg)',
    example: 70.5,
  })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({
    description: 'Altura (cm)',
    example: 175.0,
  })
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional({
    description: 'Frecuencia respiratoria',
    example: 16,
  })
  @IsOptional()
  @IsNumber()
  respiratoryRate?: number;

  @ApiPropertyOptional({
    description: 'Saturación de oxígeno (%)',
    example: 98.5,
  })
  @IsOptional()
  @IsNumber()
  oxygenSaturation?: number;

  @ApiPropertyOptional({
    description: 'ID de la cita médica asociada',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  medicalAppointmentId?: number;
}
