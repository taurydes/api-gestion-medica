import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class RoleQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Buscar por nombre del rol' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por usuario creador', type: Number })
  @IsOptional()
  @IsNumber()
  userId?: number;

  @ApiPropertyOptional({ description: 'Filtrar por estado activo', type: Boolean })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
