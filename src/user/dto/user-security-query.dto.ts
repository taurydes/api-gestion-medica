import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';


export class UserSecurityQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Filtrar por nombre o email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por rol', type: Number })
  @IsOptional()
  roleId?: number;

  @ApiPropertyOptional({ description: 'Filtrar usuarios activos', type: Boolean })
  @IsOptional()
  status?: boolean;
}