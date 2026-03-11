/**
 * @fileoverview DTOs para permisos de usuario estilo Go.
 *
 * Estructura compatible con la API de Go para respuestas de permisos de usuario.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// =============================================================================
// PERMISSION RULE (Estilo CASL/Go)
// =============================================================================

/**
 * Regla de permiso individual (similar a RawRule de CASL).
 * Compatible con la estructura de Go.
 */
export class PermissionRuleDto {
  @ApiProperty({ example: 'crear', description: 'Acción permitida' })
  action: string;

  @ApiProperty({ example: 'Campaign', description: 'Subject/Módulo' })
  subject: string;

  @ApiPropertyOptional({
    example: ['name', 'status'],
    description: 'Campos permitidos',
  })
  fields?: string[];

  @ApiPropertyOptional({
    example: { companyId: 5 },
    description: 'Condiciones de acceso',
  })
  conditions?: Record<string, any>;

  @ApiPropertyOptional({
    example: false,
    description: '¿Es regla invertida (cannot)?',
  })
  inverted?: boolean;

  @ApiPropertyOptional({
    example: 'Puede crear campañas',
    description: 'Descripción de la regla',
  })
  reason?: string;
}

// =============================================================================
// USER PERMISSIONS RESPONSE
// =============================================================================

/**
 * Información del rol del usuario.
 */
export class UserRoleInfoDto {
  @ApiProperty({ example: 1, description: 'ID del rol' })
  id: number | string;

  @ApiProperty({ example: 'Administrador', description: 'Nombre del rol' })
  name: string;
}

export class MenusDto {
  @ApiProperty({ example: 1, description: 'ID del menú' })
  id: number | string;

  @ApiProperty({ example: 'dashboard', description: 'Slug del menú' })
  slug: string;

  @ApiProperty({ example: 'Dashboard', description: 'Nombre del menú' })
  name: string;

  @ApiPropertyOptional({ example: 1, description: 'url' })
  url?: string | null;

  @ApiPropertyOptional({ example: 1, description: 'icono del menu' })
  icon?: string | null;

  @ApiPropertyOptional({ example: 1, description: 'orden' })
  order?: number | null;

  @ApiPropertyOptional({
    type: () => MenusDto,
    isArray: true,
    description: 'Submenú',
  })
  submenu: MenusDto[];
}

/**
 * Respuesta de permisos de usuario estilo Go.
 * Compatible con la estructura que espera el frontend.
 */
export class UserPermissionsResponseDto {
  @ApiProperty({ example: 10, description: 'ID del usuario' })
  userId: number | string;

  @ApiProperty({
    example: 'usuario@ejemplo.com',
    description: 'Email del usuario',
  })
  email: string;

  @ApiProperty({ type: UserRoleInfoDto, description: 'Información del rol' })
  role: UserRoleInfoDto;

  @ApiProperty({
    type: [PermissionRuleDto],
    description: 'Reglas de permisos CASL',
  })
  rules: PermissionRuleDto[];

  @ApiProperty({
    type: [MenusDto],
    description: 'Menús disponibles para el usuario',
  })
  menus: MenusDto[];

  @ApiProperty({
    example: ['Campaign.crear', 'Campaign.ver', 'User.ver'],
    description: 'Lista plana de permisos (module.action)',
  })
  permissions: string[];

  @ApiProperty({
    example: '2026-02-18T10:00:00.000Z',
    description: 'Timestamp de la respuesta',
  })
  timestamp: Date;
}

// =============================================================================
// CHECK PERMISSION RESPONSE (Enhanced)
// =============================================================================

/**
 * Respuesta mejorada de verificación de permiso (estilo Go).
 */
export class CheckPermissionResultDto {
  @ApiProperty({ example: true, description: '¿Permiso concedido?' })
  allowed: boolean;

  @ApiProperty({ example: 'Campaign', description: 'Módulo verificado' })
  module: string;

  @ApiProperty({ example: 'crear', description: 'Acción verificada' })
  action: string;

  @ApiPropertyOptional({
    example: 'No tiene permiso asignado',
    description: 'Razón (si denegado)',
  })
  reason?: string;

  @ApiPropertyOptional({ example: 10, description: 'ID del usuario' })
  userId?: number | string;
}

// =============================================================================
// ABILITY RULES RESPONSE
// =============================================================================

/**
 * Respuesta de reglas CASL para el frontend.
 * Similar a la estructura de @casl/ability.
 */
export class AbilityRulesResponseDto {
  @ApiProperty({ type: [PermissionRuleDto], description: 'Reglas de CASL' })
  rules: PermissionRuleDto[];

  @ApiProperty({ example: false, description: '¿Es detectión de errores?' })
  detectSubjectType: boolean;
}

// =============================================================================
// MODULE PERMISSIONS GROUPED
// =============================================================================

/**
 * Acción individual dentro de un módulo.
 */
export class ModuleActionDto {
  @ApiProperty({ example: 'crear', description: 'Código de la acción' })
  action: string;

  @ApiProperty({ example: 'Crear', description: 'Nombre legible de la acción' })
  actionName: string;

  @ApiProperty({ example: true, description: '¿Permitido para este usuario?' })
  allowed: boolean;
}

/**
 * Módulo con sus permisos para vista de frontend.
 */
export class ModulePermissionsGroupedDto {
  @ApiProperty({
    example: 'Campaign',
    description: 'Código del módulo (subject)',
  })
  module: string;

  @ApiProperty({ example: 'Campañas', description: 'Nombre del módulo' })
  moduleName: string;

  @ApiProperty({ type: [ModuleActionDto], description: 'Acciones disponibles' })
  permissions: ModuleActionDto[];
}

// =============================================================================
// AVAILABLE PERMISSIONS
// =============================================================================

/**
 * Módulo disponible en el sistema.
 */
export class AvailableModuleDto {
  @ApiProperty({ example: 1, description: 'ID del módulo' })
  id: number | string;

  @ApiProperty({ example: 'Campaign', description: 'Slug/código del módulo' })
  slug: string;

  @ApiProperty({ example: 'Campañas', description: 'Nombre del módulo' })
  name: string;

  @ApiPropertyOptional({ example: 1, description: 'ID del módulo padre' })
  parentId?: number | string;
}

/**
 * Acción disponible en el sistema.
 */
export class AvailableActionDto {
  @ApiProperty({ example: 1, description: 'ID de la acción' })
  id: number | string;

  @ApiProperty({ example: 'crear', description: 'Código de la acción' })
  name: string;

  @ApiProperty({ example: 'Crear', description: 'Nombre legible' })
  displayName: string;

  @ApiPropertyOptional({ example: 1, description: 'Orden de visualización' })
  order?: number;

  @ApiProperty({ example: true, description: '¿Está activa?' })
  isActive: boolean;
}

/**
 * Respuesta de permisos disponibles en el sistema (estilo Go).
 */
export class AvailablePermissionsResponseDto {
  @ApiProperty({
    type: [AvailableModuleDto],
    description: 'Módulos disponibles',
  })
  modules: AvailableModuleDto[];

  @ApiProperty({
    type: [AvailableActionDto],
    description: 'Acciones disponibles',
  })
  actions: AvailableActionDto[];
}

// =============================================================================
// PERMISSION MATRIX
// =============================================================================

/**
 * Matriz de permisos para un rol (estilo Go).
 */
export class RolePermissionMatrixDto {
  @ApiProperty({ example: 1, description: 'ID del rol' })
  roleId: number | string;

  @ApiProperty({ example: 'Administrador', description: 'Nombre del rol' })
  roleName: string;

  @ApiProperty({
    type: [ModulePermissionsGroupedDto],
    description: 'Permisos por módulo',
  })
  modules: ModulePermissionsGroupedDto[];
}
