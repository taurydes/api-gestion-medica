import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBooleanString, IsUUID } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class ParishQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Filter by description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Filter by municipality ID (UUID)' })
  @IsOptional()
  @IsUUID()
  municipalityId?: string;

  @ApiPropertyOptional({ description: 'Filter by active status', example: true })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
}
