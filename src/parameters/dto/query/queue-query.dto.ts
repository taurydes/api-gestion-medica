// src/parameters/dto/pagination/queue-pagination.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';
import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

export class QueueQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  companyId?: number;
}
