import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PermissionRoleAssignmentDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'ID del permiso (UUID)' })
  @IsUUID()
  permissionId: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'ID del submenu (UUID)' })
  @IsUUID()
  submenuId: string;
}

export class CreatepermissionsRolesDto {
  @ApiProperty({
    description: 'ID del rol al que se asignarán los permisos (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  roleId: string;

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
