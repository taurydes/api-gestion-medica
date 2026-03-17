import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PermissionRoleAssignmentDto {
  @ApiProperty({ example: 'uuid', description: 'ID del permiso' })
  @IsUUID()
  permissionId: string;

  @ApiProperty({ example: 'uuid', description: 'ID del submenú (menú)' })
  @IsUUID()
  submenuId: string;
}

export class CreatepermissionsRolesDto {
  @ApiProperty({
    description: 'ID del rol al que se asignarán los permisos',
    example: 'uuid',
  })
  @IsUUID()
  roleId: string;

  @ApiProperty({
    description: 'Lista de asignaciones (permiso + submenú)',
    type: [PermissionRoleAssignmentDto],
    example: [
      { permissionId: 'uuid-permiso', submenuId: 'uuid-menu' },
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PermissionRoleAssignmentDto)
  assignments: PermissionRoleAssignmentDto[];
}
