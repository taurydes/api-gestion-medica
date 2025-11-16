// src/parameters/dto/pagination/state-pagination.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';
import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class StateQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iso?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
