import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReviewMammographyAnalysisDto {
  @ApiPropertyOptional({ description: 'Notas u observaciones del médico revisor' })
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
