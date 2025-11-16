import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, IsBooleanString } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class ParishQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Filter by description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Filter by municipality ID' })
  @IsOptional()
  @IsInt()
  @Min(1)
  municipalityId?: number;

  @ApiPropertyOptional({ description: 'Filter by active status', example: true })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
}
