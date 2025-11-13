import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PermissionRoleAssignmentDto {
  @ApiProperty({ example: 10, description: 'ID del permiso' })
  @IsNumber()
  @IsInt()
  permissionId: number;

  @ApiProperty({ example: 5, description: 'ID del submenu' })
  @IsNumber()
  @IsInt()
  submenuId: number;
}

export class CreatepermissionsRolesDto {
  @ApiProperty({
    description: 'ID del rol al que se asignarán los permisos',
    example: 1,
  })
  @IsNumber()
  @IsInt()
  roleId: number;

  @ApiProperty({
    description: 'Lista de asignaciones (permiso + submenu)',
    type: [PermissionRoleAssignmentDto],
    example: [
      { permissionId: 1, submenuId: 5 },
      { permissionId: 2, submenuId: 5 },
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PermissionRoleAssignmentDto)
  assignments: PermissionRoleAssignmentDto[];
}
