import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';


export class UserQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({ description: 'Filtrar por nombre o email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por rol', type: String })
  @IsOptional()
  roleId?: string;

  @ApiPropertyOptional({ description: 'Filtrar usuarios activos', type: Boolean })
  @IsOptional()
  status?: boolean;
}