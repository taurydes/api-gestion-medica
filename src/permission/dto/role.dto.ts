/**
 * @fileoverview DTOs para gestión de roles estilo Go.
 *
 * Estructura compatible con la API de Go (casl.roles).
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

// =============================================================================
// REQUEST DTOs
// =============================================================================

/**
 * DTO para crear un rol (similar a Go: casl.roles).
 */
export class CreateRoleDto {
  @ApiProperty({ example: 'Administrador', description: 'Nombre del rol' })
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiPropertyOptional({ example: true, description: 'Estado activo', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false, description: '¿Es rol de Telpo/Kiosk?', default: false })
  @IsOptional()
  @IsBoolean()
  isTelpo?: boolean;
}

/**
 * DTO para actualizar un rol.
 */
export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Administrador', description: 'Nombre del rol' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({ example: true, description: 'Estado activo' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false, description: '¿Es rol de Telpo/Kiosk?' })
  @IsOptional()
  @IsBoolean()
  isTelpo?: boolean;
}

// =============================================================================
// RESPONSE DTOs
// =============================================================================

/**
 * Respuesta de un rol (similar a Go Role struct).
 */
export class RoleResponseDto {
  @ApiProperty({ example: 1, description: 'ID del rol' })
  id: number;

  @ApiProperty({ example: 'Administrador', description: 'Nombre del rol' })
  name: string;

  @ApiProperty({ example: true, description: 'Estado activo' })
  isActive: boolean;

  @ApiProperty({ example: false, description: '¿Es rol de Telpo/Kiosk?' })
  isTelpo: boolean;

  @ApiProperty({ example: '2026-02-18T10:00:00.000Z', description: 'Fecha de creación' })
  createdAt: Date;

  @ApiPropertyOptional({ example: '2026-02-18T10:00:00.000Z', description: 'Fecha de actualización' })
  updatedAt?: Date;
}

/**
 * Rol con permisos agregados para vista completa.
 */
export class RoleWithPermissionsDto extends RoleResponseDto {
  @ApiProperty({
    example: [
      { module: 'Campaign', action: 'crear', permissionId: 1, menuId: 10, isActive: true },
    ],
    description: 'Permisos asociados al rol',
  })
  permissions: Array<{
    module: string;
    action: string;
    permissionId: number;
    menuId: number;
    isActive: boolean;
  }>;
}
