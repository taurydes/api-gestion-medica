import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class CommonPersonQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({
    description: 'Filtrar por nombre, apellido o documento',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por estado', type: Boolean })
  @IsOptional()
  status?: boolean;
}
