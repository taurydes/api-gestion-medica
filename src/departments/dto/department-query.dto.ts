import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class DepartmentQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({
    description: 'Filtrar por nombre de departamento',
    example: 'Cardiología',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de centro médico',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  medicalCenterId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por estado activo',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
