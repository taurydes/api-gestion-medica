import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';
import { Type } from 'class-transformer';

export class DoctorQueryDto extends QueryPaginationDto {
  @ApiPropertyOptional({
    description: 'Filtrar por especialidad o número de licencia',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por centro médico',
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  medicalCenterId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por departamento',
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  departmentId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar doctores activos',
    type: Boolean,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filtrar por número de documento' })
  @IsOptional()
  @IsString()
  documentNumber?: string;
}
