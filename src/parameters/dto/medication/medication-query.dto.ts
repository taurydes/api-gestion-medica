import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsBooleanString } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class MedicationQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Buscar por nombre' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por estado activo' })
  @IsOptional()
  @IsBooleanString()
  isActive?: boolean;
}
