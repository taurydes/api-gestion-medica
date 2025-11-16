import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class MenuQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Buscar por nombre, ruta o icono' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por menú padre', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  parentId?: number;

  @ApiPropertyOptional({ description: 'Filtrar menús activos', type: Boolean })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
