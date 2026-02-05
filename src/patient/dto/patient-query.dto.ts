import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

/**
 * DTO para filtrar y paginar la consulta de pacientes
 * Extiende QueryPaginationDto para heredar page, limit y order
 */
export class PatientQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({
    description: 'Búsqueda por nombre, apellido, documento o código de paciente',
    example: 'Juan',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de sangre',
    example: 'O+',
  })
  @IsOptional()
  @IsString()
  bloodType?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por estado activo/inactivo',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}
