import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';

/**
 * DTO para asignar múltiples permisos a un rol usando IDs.
 */
export class BulkAssignPermissionsToRoleByIdDto {
  @ApiProperty({
    description: 'ID del rol al que se asignarán los permisos',
    example: 'uuid-string',
  })
  roleId: string | number;

  @ApiProperty({ description: 'ID del módulo (menú)', example: 'uuid-string' })
  moduleId: string | number;

  @ApiProperty({
    description: 'Lista de IDs de permisos a asignar',
    example: ['1', '2', '3'],
    type: [Object],
  })
  @IsArray()
  @ArrayMinSize(1)
  permissionIds: (string | number)[];
}

/**
 * DTO para asignar múltiples permisos a un usuario usando IDs.
 */
export class BulkAssignPermissionsToUserByIdDto {
  @ApiProperty({
    description: 'ID del usuario al que se asignarán los permisos',
    example: 'uuid-string',
  })
  userId: string | number;

  @ApiProperty({ description: 'ID del módulo (menú)', example: 'uuid-string' })
  moduleId: string | number;

  @ApiProperty({
    description: 'Lista de IDs de permisos a asignar',
    example: ['1', '2', '3'],
    type: [Object],
  })
  @IsArray()
  @ArrayMinSize(1)
  permissionIds: (string | number)[];
}

/**
 * Item de permiso por ID para bulk operations.
 */
export class PermissionItemByIdDto {
  @ApiProperty({ description: 'ID del módulo (menú)', example: 'uuid-string' })
  moduleId: string | number;

  @ApiProperty({ description: 'ID del permiso/acción', example: 'uuid-string' })
  permissionId: string | number;

  @ApiPropertyOptional({
    description: 'Si está habilitado',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/**
 * DTO para asignar múltiples permisos de múltiples módulos a un rol usando IDs.
 */
export class BulkAssignMultipleModulesPermissionsToRoleByIdDto {
  @ApiProperty({
    description: 'ID del rol al que se asignarán los permisos',
    example: 'uuid-string',
  })
  roleId: string | number;

  @ApiProperty({
    description: 'Lista de permisos (moduleId + permissionId)',
    type: [PermissionItemByIdDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PermissionItemByIdDto)
  permissions: PermissionItemByIdDto[];
}

/**
 * DTO para asignar múltiples permisos de múltiples módulos a un usuario usando IDs.
 */
export class BulkAssignMultipleModulesPermissionsToUserByIdDto {
  @ApiProperty({
    description: 'ID del usuario al que se asignarán los permisos',
    example: 'uuid-string',
  })
  userId: string | number;

  @ApiProperty({
    description: 'Lista de permisos (moduleId + permissionId)',
    type: [PermissionItemByIdDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PermissionItemByIdDto)
  permissions: PermissionItemByIdDto[];
}

/**
 * Respuesta de asignación masiva de permisos.
 */
export class BulkAssignPermissionsResponseDto {
  @ApiProperty({ description: 'Si la operación fue exitosa', example: true })
  success: boolean;

  @ApiProperty({ description: 'Cantidad de permisos asignados', example: 4 })
  assignedCount: number;

  @ApiPropertyOptional({
    description: 'Mensaje adicional',
    example: 'Permisos asignados correctamente',
  })
  message?: string;

  @ApiPropertyOptional({ description: 'Errores si los hubo', type: [String] })
  errors?: string[];
}
