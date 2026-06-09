import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class QueryMammographyAnalysisDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD. Filtra por fecha de creación.' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description: 'YYYY-MM-DD. Inicio del rango (inclusive). Tiene precedencia sobre `date`.',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'YYYY-MM-DD. Fin del rango (inclusive). Tiene precedencia sobre `date`.',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Sólo análisis no revisados' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyUnreviewed?: boolean;

  @ApiPropertyOptional({
    description:
      'Filtrar por estado de revisión: `true` solo revisados, `false` solo pendientes. Omitir para mostrar todos.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    const v = String(value).toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
    return undefined;
  })
  @IsBoolean()
  isReviewed?: boolean;

  @ApiPropertyOptional({ description: 'Probabilidad mínima (0-100)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minProbability?: number;

  @ApiPropertyOptional({ description: 'danger | success' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  offset?: number;
}
