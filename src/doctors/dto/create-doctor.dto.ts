import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDoctorDto {
  @ApiProperty({ description: 'ID de la persona común asociada al doctor' })
  @IsNumber()
  @Type(() => Number)
  commonPersonId: number;

  @ApiPropertyOptional({ description: 'ID del centro médico donde trabaja' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  medicalCenterId?: number;

  @ApiProperty({ description: 'Especialidad médica' })
  @IsString()
  @MaxLength(255)
  specialty: string;

  @ApiProperty({ description: 'Número de licencia o matrícula profesional' })
  @IsString()
  @MaxLength(100)
  licenseNumber: string;

  @ApiPropertyOptional({ description: 'Estado activo/inactivo', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
