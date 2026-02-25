import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
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
    description: 'ID del centro médico al que pertenece el departamento',
    example: 1,
  })
  @IsNotEmpty({ message: 'El ID del centro médico es requerido.' })
  @Type(() => Number)
  @IsNumber()
  medicalCenterId: number;

  @ApiPropertyOptional({
    description: 'Estado activo del departamento',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'IDs de las especialidades asociadas al departamento',
    example: [1, 2],
    type: [Number],
  })
  @IsOptional()
  @IsNumber({}, { each: true })
  specialtyIds?: number[];
}
