import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBooleanString } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class CivilStatusQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Filter by description containing text' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status (true/false)',
    example: true,
  })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
}
