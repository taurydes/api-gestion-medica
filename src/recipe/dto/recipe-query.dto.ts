import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

/**
 * DTO para filtrar y paginar la consulta de recetas médicas
 */
export class RecipeQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({
    description: 'Búsqueda por número de receta o diagnóstico',
    example: 'REC-2026',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de paciente (UUID)',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de doctor (UUID)',
  })
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de historial médico (UUID)',
  })
  @IsOptional()
  @IsUUID()
  medicalHistoryId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por estado (active, dispensed, expired, cancelled)',
    example: 'active',
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
    description: 'Fecha de inicio para filtrar recetas (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha de fin para filtrar recetas (YYYY-MM-DD)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsString()
  endDate?: string;
}
