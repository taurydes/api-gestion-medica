import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO para crear una nueva especialidad médica
 */
export class CreateSpecialtyDto {
  @ApiProperty({
    description: 'Nombre de la especialidad médica',
    example: 'Cardiología',
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la especialidad es requerido' })
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Descripción de la especialidad',
    example: 'Especialidad médica que se encarga del estudio y tratamiento de las enfermedades del corazón',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Código único de la especialidad',
    example: 'CARD',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional({
    description: 'Estado activo/inactivo de la especialidad',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
