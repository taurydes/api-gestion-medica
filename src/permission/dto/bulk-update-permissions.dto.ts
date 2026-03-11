import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BulkUpdatePermissionItemDto {
  @ApiProperty({ example: 'Campaign', description: 'Módulo/menú (slug)' })
  @IsString()
  module: string;

  @ApiProperty({ example: 'crear', description: 'Acción' })
  @IsString()
  action: string;

  @ApiProperty({ example: true, description: 'Habilitar/deshabilitar permiso' })
  @IsBoolean()
  enabled: boolean;
}

/**
 * Body DTO: Actualizar múltiples permisos para un rol.
 */
export class BulkUpdatePermissionsDto {
  @ApiProperty({ example: 2, description: 'ID del rol' })
  @IsInt()
  @Min(1)
  roleId: number;

  @ApiProperty({ type: [BulkUpdatePermissionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkUpdatePermissionItemDto)
  permissions: BulkUpdatePermissionItemDto[];
}
