// src/parameters/dto/pagination/availability-pagination.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';
import { IsOptional, IsBoolean, IsString } from 'class-validator';

export class AvailabilityPaginationDto extends QueryPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
