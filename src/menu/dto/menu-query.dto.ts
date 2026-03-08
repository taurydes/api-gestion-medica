import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsBoolean } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class MenuQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Buscar por nombre, ruta o icono' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por menú padre (UUID)', type: String })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Filtrar menús activos', type: Boolean })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
