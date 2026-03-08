import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({
    description: 'Nombre del departamento',
    example: 'Cardiología',
    maxLength: 150,
  })
  @IsNotEmpty({ message: 'El nombre del departamento es requerido.' })
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description: 'Descripción del departamento',
    example: 'Departamento especializado en enfermedades del corazón.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'ID del centro médico al que pertenece el departamento (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsNotEmpty({ message: 'El ID del centro médico es requerido.' })
  @IsUUID()
  medicalCenterId: string;

  @ApiPropertyOptional({
    description: 'Estado activo del departamento',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'IDs de las especialidades asociadas al departamento (UUID)',
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    type: [String],
  })
  @IsOptional()
  @IsUUID('4', { each: true })
  specialtyIds?: string[];
}
