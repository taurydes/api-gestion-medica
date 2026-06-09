import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
