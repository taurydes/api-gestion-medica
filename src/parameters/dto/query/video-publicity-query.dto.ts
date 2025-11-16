// src/parameters/dto/pagination/video-publicity-pagination.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';
import { IsOptional, IsNumber, IsString } from 'class-validator';

export class VideoPublicityQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  customerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  companyId?: number;
}
