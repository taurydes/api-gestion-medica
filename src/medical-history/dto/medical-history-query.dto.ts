import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

/**
 * DTO para filtrar y paginar la consulta de historiales médicos
 */
export class MedicalHistoryQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({
    description: 'Búsqueda por número de consulta, diagnóstico o motivo',
    example: 'dolor',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de paciente',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  patientId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de doctor',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  doctorId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de centro médico',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  medicalCenterId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de especialidad',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  specialtyId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por estado (in_progress, completed, cancelled)',
    example: 'completed',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por estado activo/inactivo',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Fecha de inicio para filtrar consultas (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha de fin para filtrar consultas (YYYY-MM-DD)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsString()
  endDate?: string;
}
