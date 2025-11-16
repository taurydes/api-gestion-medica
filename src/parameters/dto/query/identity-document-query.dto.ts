import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBooleanString } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class IdentityDocumentQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Filter by letter (V, E, P, etc)' })
  @IsOptional()
  @IsString()
  letter?: string;

  @ApiPropertyOptional({ description: 'Filter by description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
}
