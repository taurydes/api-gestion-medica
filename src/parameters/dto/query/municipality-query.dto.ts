import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsBooleanString, Min } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class MunicipalityQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Filter by description (name)' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Filter by State ID' })
  @IsOptional()
  @IsInt()
  @Min(1)
  stateId?: number;

  @ApiPropertyOptional({ description: 'Filter by active status', example: true })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
}
