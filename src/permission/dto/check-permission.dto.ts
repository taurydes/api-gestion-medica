import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * DTO (query/body): Verificar si un usuario tiene un permiso.
 * Nota: en el controller actual se usa como query (para /check)
 * y el userId se toma del JWT.
 */
export class CheckPermissionDto {
  @ApiPropertyOptional({
    example: 'uuid-string',
    description: 'ID del usuario (opcional; en /me se toma del JWT)',
  })
  @IsOptional()
  userId?: string | number;

  @ApiProperty({
    example: 'Campaign',
    description: "Módulo/subject (ej: 'Campaign')",
  })
  @IsString()
  module: string;

  @ApiProperty({
    example: 'ver',
    description: "Acción (ej: 'crear', 'ver', 'editar', 'eliminar')",
  })
  @IsString()
  action: string;

  @ApiPropertyOptional({
    example: 123,
    description: 'ID del recurso (si aplica)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  resourceId?: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'CompanyId para validación multi-tenant (si aplica)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  companyId?: number;
}
