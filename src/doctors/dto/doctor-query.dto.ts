import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsUUID } from 'class-validator';
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
    description: 'Filtrar por centro médico (UUID)',
    type: String,
  })
  @IsOptional()
  @IsUUID()
  medicalCenterId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por departamento (UUID)',
    type: String,
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

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
