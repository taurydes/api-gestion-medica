import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BulkUpdatePermissionItemDto {
  @ApiProperty({ example: 'Campaign', description: 'Módulo/menú (slug)' })
  @IsString()
  @IsNotEmpty()
  module: string;

  @ApiProperty({ example: 'crear', description: 'Acción' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: true, description: 'Habilitar/deshabilitar permiso' })
  @IsBoolean()
  enabled: boolean;
}

/**
 * Body DTO: Actualizar múltiples permisos para un rol.
 */
export class BulkUpdatePermissionsDto {
  @ApiProperty({ example: '69cf7b3a-864c-44d7-8541-1ab57d34f49b', description: 'ID del rol (UUID)' })
  @IsUUID('all', { message: 'roleId debe ser un UUID válido' })
  roleId: string;

  @ApiProperty({ type: [BulkUpdatePermissionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkUpdatePermissionItemDto)
  permissions: BulkUpdatePermissionItemDto[];
}
