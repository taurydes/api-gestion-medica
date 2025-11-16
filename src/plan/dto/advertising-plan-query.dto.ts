import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class AdvertisingPlanQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Buscar por code o name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar planes activos', type: Boolean })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
