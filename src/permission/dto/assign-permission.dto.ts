import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Body DTO: Asignar (o reactivar) un permiso a un rol.
 */
export class AssignPermissionDto {
  @ApiProperty({ example: 'uuid-string', description: 'ID del rol' })
  roleId: string | number;

  @ApiProperty({
    example: 'Campaign',
    description: "Slug del módulo/menú (ej: 'Campaign', 'User')",
  })
  @IsString()
  menuSlug: string;

  @ApiProperty({
    example: 'crear',
    description:
      "Acción del permiso (ej: 'crear', 'ver', 'editar', 'eliminar')",
  })
  @IsString()
  action: string;

  @ApiPropertyOptional({
    example: 'uuid-string',
    description: 'ID del permiso si ya existe (opcional)',
  })
  @IsOptional()
  permissionId?: string | number;
}
