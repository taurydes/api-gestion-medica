import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBooleanString, IsUUID } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class MunicipalityQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Filter by description (name)' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Filter by State ID (UUID)' })
  @IsOptional()
  @IsUUID()
  stateId?: string;

  @ApiPropertyOptional({ description: 'Filter by active status', example: true })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
}
