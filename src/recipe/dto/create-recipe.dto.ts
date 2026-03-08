import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  IsString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsDateString,
} from 'class-validator';
import { CreateRecipeItemDto } from './create-recipe-item.dto';

/**
 * DTO para crear una nueva receta médica
 */
export class CreateRecipeDto {
  @ApiProperty({
    description: 'ID del historial médico asociado (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'El ID del historial médico es requerido' })
  medicalHistoryId: string;

  @ApiProperty({
    description: 'ID del paciente (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'El ID del paciente es requerido' })
  patientId: string;

  @ApiProperty({
    description: 'ID del doctor que emite la receta (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'El ID del doctor es requerido' })
  doctorId: string;

  @ApiPropertyOptional({
    description: 'Fecha de vencimiento de la receta (YYYY-MM-DD)',
    example: '2026-03-04',
  })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({
    description: 'Diagnóstico asociado a la receta',
    example: 'Cefalea tensional',
  })
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional({
    description: 'Instrucciones generales para el paciente',
    example: 'Tomar medicamentos con abundante agua',
  })
  @IsOptional()
  @IsString()
  generalInstructions?: string;

  @ApiPropertyOptional({
    description: 'Notas adicionales del médico',
    example: 'Evitar actividad física intensa durante el tratamiento',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    description: 'Lista de medicamentos prescritos',
    type: [CreateRecipeItemDto],
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Debe incluir al menos un medicamento en la receta',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateRecipeItemDto)
  items: CreateRecipeItemDto[];

  @ApiPropertyOptional({
    description: 'ID de la cita médica asociada (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  medicalAppointmentId?: string;
}
