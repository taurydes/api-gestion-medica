import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

/**
 * Body DTO: Revocar (desactivar) un permiso de un rol.
 */
export class RevokePermissionDto {
  @ApiProperty({ example: '69cf7b3a-864c-44d7-8541-1ab57d34f49b', description: 'ID del rol (UUID)' })
  @IsUUID('all', { message: 'roleId debe ser un UUID válido' })
  roleId: string;

  @ApiProperty({ example: 'Campaign', description: "Slug del módulo/menú (ej: 'Campaign', 'User')" })
  @IsString()
  @IsNotEmpty()
  menuSlug: string;

  @ApiProperty({ example: 'eliminar', description: "Acción del permiso (ej: 'crear', 'ver', 'editar', 'eliminar')" })
  @IsString()
  @IsNotEmpty()
  action: string;
}
