import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class QueryPaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number) 
  @IsInt({ message: 'page must be a number' })
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be a number' })
  @Min(1)
  limit: number = 10;

  @ApiPropertyOptional({ default: SortOrder.ASC, enum: SortOrder })
  @IsOptional()
  @IsEnum(SortOrder)
  order: SortOrder = SortOrder.ASC;
}


