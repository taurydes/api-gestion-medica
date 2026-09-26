import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

/**
 * DTO para asignar múltiples permisos a un rol usando IDs.
 */
export class BulkAssignPermissionsToRoleByIdDto {
  @ApiProperty({
    description: 'ID del rol (UUID) al que se asignarán los permisos',
    example: '69cf7b3a-864c-44d7-8541-1ab57d34f49b',
  })
  @IsUUID('all', { message: 'roleId debe ser un UUID válido' })
  roleId: string;

  @ApiProperty({
    description: 'ID del módulo (menú, UUID)',
    example: 'fd6a2bac-c8fe-4e91-9839-cd5a06fef078',
  })
  @IsUUID('all', { message: 'moduleId debe ser un UUID válido' })
  moduleId: string;

  @ApiProperty({
    description: 'Lista de IDs de permisos (UUID) a asignar',
    example: ['d5d6de53-0734-44e5-ae49-d9057aecab23'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true, message: 'Cada permissionId debe ser un UUID válido' })
  permissionIds: string[];
}

/**
 * Item de permiso por ID para bulk operations.
 */
export class PermissionItemByIdDto {
  @ApiProperty({
    description: 'ID del módulo (menú, UUID)',
    example: 'fd6a2bac-c8fe-4e91-9839-cd5a06fef078',
  })
  @IsUUID('all', { message: 'moduleId debe ser un UUID válido' })
  moduleId: string;

  @ApiProperty({
    description: 'ID del permiso/acción (UUID)',
    example: 'd5d6de53-0734-44e5-ae49-d9057aecab23',
  })
  @IsUUID('all', { message: 'permissionId debe ser un UUID válido' })
  permissionId: string;

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
    description: 'ID del rol (UUID) al que se asignarán los permisos',
    example: '69cf7b3a-864c-44d7-8541-1ab57d34f49b',
  })
  @IsUUID('all', { message: 'roleId debe ser un UUID válido' })
  roleId: string;

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
