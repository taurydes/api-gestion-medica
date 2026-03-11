import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

/**
 * Body DTO: Revocar (desactivar) un permiso de un rol.
 */
export class RevokePermissionDto {
  @ApiProperty({ example: 2, description: 'ID del rol' })
  @IsInt()
  @Min(1)
  roleId: number;

  @ApiProperty({ example: 'Campaign', description: "Slug del módulo/menú (ej: 'Campaign', 'User')" })
  @IsString()
  menuSlug: string;

  @ApiProperty({ example: 'eliminar', description: "Acción del permiso (ej: 'crear', 'ver', 'editar', 'eliminar')" })
  @IsString()
  action: string;
}
