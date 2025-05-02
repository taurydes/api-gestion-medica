import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, ArrayNotEmpty, IsInt } from 'class-validator';

export class CreatePermissionsRoleDto {
  @ApiProperty({
    description: 'ID del rol al que se asignarán los permisos',
    example: 1,
  })
  @IsNumber({}, { message: 'El ID del rol debe ser un número' })
  @IsInt({ message: 'El ID del rol debe ser un número entero' })
  roleId: number;

  @ApiProperty({
    description: 'Lista de IDs de permisos a asignar',
    example: [1, 2, 3],
  })
  @IsArray({ message: 'Los IDs de permisos deben estar en un arreglo' })
  @ArrayNotEmpty({ message: 'La lista de IDs de permisos no puede estar vacía' })
  @IsNumber({}, { each: true, message: 'Cada ID de permiso debe ser un número' })
  permissionIds: number[];
}