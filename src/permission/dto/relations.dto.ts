/**
 * @fileoverview DTOs para relaciones de permisos estilo Go.
 *
 * Incluye:
 * - ModulePermission (module_permissions en Go)
 * - RolePermission (role_permissions en Go)
 * - UserRole (user_roles en Go)
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

// =============================================================================
// MODULE-PERMISSION (Relación módulo <-> permiso)
// =============================================================================

/**
 * DTO para crear relación módulo-permiso.
 * Similar a Go: casl.module_permissions
 */
export class CreateModulePermissionDto {
  @ApiProperty({ example: 1, description: 'ID del módulo (menu.id)' })
  @IsInt()
  @Min(1)
  moduleId: number;

  @ApiProperty({ example: 1, description: 'ID del permiso (permisos.id)' })
  @IsInt()
  @Min(1)
  permissionId: number;
}

/**
 * Respuesta de relación módulo-permiso.
 */
export class ModulePermissionResponseDto {
  @ApiProperty({ example: 1, description: 'ID del módulo' })
  moduleId: number;

  @ApiProperty({ example: 1, description: 'ID del permiso' })
  permissionId: number;

  @ApiProperty({ example: '2026-02-18T10:00:00.000Z', description: 'Fecha de creación' })
  createdAt: Date;
}

// =============================================================================
// ROLE-PERMISSION (Relación rol <-> permiso)
// =============================================================================

/**
 * DTO para crear relación rol-permiso.
 * Similar a Go: casl.role_permissions
 * 
 * NOTA: En NestJS usamos la estructura existente (permisos_roles)
 * que incluye submenu_id para mayor granularidad.
 */
export class CreateRolePermissionDto {
  @ApiProperty({ example: 1, description: 'ID del rol' })
  @IsInt()
  @Min(1)
  roleId: number;

  @ApiProperty({ example: 1, description: 'ID del permiso (acción)' })
  @IsInt()
  @Min(1)
  permissionId: number;

  @ApiProperty({ example: 10, description: 'ID del módulo/menú (submenu_id)' })
  @IsInt()
  @Min(1)
  moduleId: number;
}

/**
 * Respuesta de relación rol-permiso.
 */
export class RolePermissionResponseDto {
  @ApiProperty({ example: 1, description: 'ID de la relación' })
  id: number;

  @ApiProperty({ example: 1, description: 'ID del rol' })
  roleId: number;

  @ApiProperty({ example: 1, description: 'ID del permiso' })
  permissionId: number;

  @ApiProperty({ example: 10, description: 'ID del módulo (submenu_id)' })
  moduleId: number;

  @ApiProperty({ example: true, description: 'Estado activo' })
  isActive: boolean;

  @ApiProperty({ example: '2026-02-18T10:00:00.000Z', description: 'Fecha de creación' })
  createdAt: Date;
}

// =============================================================================
// USER-ROLE (Relación usuario <-> rol)
// =============================================================================

/**
 * DTO para asignar rol a usuario.
 * Similar a Go: casl.user_roles
 * 
 * NOTA: En NestJS, el rol está directamente en la tabla users (role_id).
 * Este DTO es para consistencia con la API de Go si se necesita
 * la estructura de múltiples roles por usuario en el futuro.
 */
export class CreateUserRoleDto {
  @ApiProperty({ example: 10, description: 'ID del usuario' })
  @IsInt()
  @Min(1)
  userId: number;

  @ApiProperty({ example: 1, description: 'ID del rol' })
  @IsInt()
  @Min(1)
  roleId: number;
}

/**
 * Respuesta de relación usuario-rol.
 */
export class UserRoleResponseDto {
  @ApiProperty({ example: 10, description: 'ID del usuario' })
  userId: number;

  @ApiProperty({ example: 1, description: 'ID del rol' })
  roleId: number;

  @ApiProperty({ example: '2026-02-18T10:00:00.000Z', description: 'Fecha de creación/asignación' })
  createdAt: Date;
}
