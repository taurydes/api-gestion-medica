import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, IsUUID } from 'class-validator';

/**
 * DTO para crear una reseña/diagnóstico médico
 * Este DTO es usado cuando el doctor finaliza la consulta y registra el diagnóstico
 */
export class CreateMedicalReviewDto {
  @ApiProperty({
    description: 'ID del historial médico al cual se agrega el diagnóstico (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'El ID del historial médico es requerido' })
  medicalHistoryId: string;

  @ApiProperty({
    description: 'Diagnóstico del médico',
    example: 'Cefalea tensional por estrés laboral',
  })
  @IsString()
  @IsNotEmpty({ message: 'El diagnóstico es requerido' })
  diagnosis: string;

  @ApiPropertyOptional({
    description: 'Código CIE-10 del diagnóstico',
    example: 'G44.2',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  diagnosisCode?: string;

  @ApiPropertyOptional({
    description: 'Plan de tratamiento recomendado',
    example: 'Reposo, hidratación adecuada, analgésicos según prescripción',
  })
  @IsOptional()
  @IsString()
  treatmentPlan?: string;

  @ApiPropertyOptional({
    description: 'Observaciones adicionales del médico',
    example: 'Se recomienda control en 15 días si persisten los síntomas',
  })
  @IsOptional()
  @IsString()
  observations?: string;

  @ApiPropertyOptional({
    description: 'Fecha recomendada para seguimiento (YYYY-MM-DD)',
    example: '2026-02-19',
  })
  @IsOptional()
  @IsString()
  followUpDate?: string;

  @ApiPropertyOptional({
    description: 'Notas para el seguimiento',
    example: 'Evaluar respuesta al tratamiento',
  })
  @IsOptional()
  @IsString()
  followUpNotes?: string;
}
