/**
 * @fileoverview DTOs para gestión de módulos estilo Go.
 *
 * Estructura compatible con la API de Go:
 * - modules (casl.modules)
 * - modules-tree (vista con permisos agregados)
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

// =============================================================================
// REQUEST DTOs
// =============================================================================

/**
 * DTO para crear un módulo (similar a Go: casl.modules).
 */
export class CreateModuleDto {
  @ApiProperty({ example: 'Campaign', description: 'Código único del módulo (usado como subject en CASL)' })
  @IsString()
  @Length(1, 100)
  code: string;

  @ApiProperty({ example: 'Campañas', description: 'Nombre legible del módulo' })
  @IsString()
  @Length(1, 150)
  name: string;

  @ApiPropertyOptional({ example: 'Gestión de campañas publicitarias', description: 'Descripción del módulo' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID del módulo padre (para jerarquía)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number;

  @ApiPropertyOptional({ example: true, description: 'Estado activo', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO para actualizar un módulo.
 */
export class UpdateModuleDto {
  @ApiPropertyOptional({ example: 'Campaign', description: 'Código único del módulo' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  code?: string;

  @ApiPropertyOptional({ example: 'Campañas', description: 'Nombre legible del módulo' })
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @ApiPropertyOptional({ example: 'Gestión de campañas', description: 'Descripción del módulo' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID del módulo padre' })
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number;

  @ApiPropertyOptional({ example: true, description: 'Estado activo' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// =============================================================================
// RESPONSE DTOs
// =============================================================================

/**
 * Respuesta de un módulo (similar a Go Module struct).
 */
export class ModuleResponseDto {
  @ApiProperty({ example: 1, description: 'ID del módulo' })
  id: number;

  @ApiProperty({ example: 'Campaign', description: 'Código único (subject CASL)' })
  code: string;

  @ApiProperty({ example: 'Campañas', description: 'Nombre del módulo' })
  name: string;

  @ApiPropertyOptional({ example: 'Gestión de campañas', description: 'Descripción' })
  description?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID del módulo padre' })
  parentId?: number;

  @ApiProperty({ example: true, description: 'Estado activo' })
  isActive: boolean;

  @ApiProperty({ example: '2026-02-18T10:00:00.000Z', description: 'Fecha de creación' })
  createdAt: Date;

  @ApiProperty({ example: '2026-02-18T10:00:00.000Z', description: 'Fecha de actualización' })
  updatedAt: Date;
}

/**
 * Permiso individual dentro del árbol de módulos.
 */
export class ModulePermissionItemDto {
  @ApiProperty({ example: 1, description: 'ID del permiso' })
  id: number;

  @ApiProperty({ example: 'crear', description: 'Acción del permiso' })
  action: string;

  @ApiProperty({ example: 'Campaign', description: 'Subject (código del módulo)' })
  subject: string;

  @ApiPropertyOptional({ example: ['name', 'status'], description: 'Campos permitidos (column-level)' })
  fields?: string[];

  @ApiPropertyOptional({ example: { companyId: 5 }, description: 'Condiciones (row-level)' })
  conditions?: Record<string, any>;

  @ApiPropertyOptional({ example: 'Crear campañas', description: 'Descripción del permiso' })
  description?: string;

  @ApiProperty({ example: true, description: 'Estado activo' })
  isActive: boolean;
}

/**
 * Módulo con permisos agregados (similar a Go v_module_permissions_tree).
 */
export class ModuleTreeResponseDto extends ModuleResponseDto {
  @ApiProperty({ type: [ModulePermissionItemDto], description: 'Permisos asociados al módulo' })
  permissions: ModulePermissionItemDto[];
}
