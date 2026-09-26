import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Body DTO: Asignar (o reactivar) un permiso a un rol.
 */
export class AssignPermissionDto {
  @ApiProperty({ example: '69cf7b3a-864c-44d7-8541-1ab57d34f49b', description: 'ID del rol (UUID)' })
  @IsUUID('all', { message: 'roleId debe ser un UUID válido' })
  roleId: string;

  @ApiProperty({
    example: 'Campaign',
    description: "Slug del módulo/menú (ej: 'Campaign', 'User')",
  })
  @IsString()
  @IsNotEmpty()
  menuSlug: string;

  @ApiProperty({
    example: 'crear',
    description:
      "Acción del permiso (ej: 'crear', 'ver', 'editar', 'eliminar')",
  })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiPropertyOptional({
    example: 'd5d6de53-0734-44e5-ae49-d9057aecab23',
    description: 'ID del permiso (UUID). Si se envía, tiene prioridad sobre `action`',
  })
  @IsOptional()
  @IsUUID('all', { message: 'permissionId debe ser un UUID válido' })
  permissionId?: string;
}
