import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({
    description: 'Nombre único del permiso',
    example: 'view_users',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  name: string;

  @ApiProperty({
    description: 'Nombre descriptivo del permiso',
    example: 'Ver usuarios',
  })
  @IsString({ message: 'El nombre descriptivo debe ser una cadena de texto' })
  displayName: string;

  @ApiProperty({
    description: 'Orden del permiso',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber({}, { message: 'El orden debe ser un número' })
  order?: number;

  @ApiProperty({
    description: 'Indica si el permiso es requerido',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'El campo requerido debe ser un valor booleano' })
  required?: boolean;

  @ApiProperty({
    description: 'Tipo de control asociado al permiso',
    example: 'checkbox',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'El tipo de control debe ser una cadena de texto' })
  controlType?: string;

  @ApiProperty({
    description: 'Indica si el permiso está activo',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser un valor booleano' })
  active?: boolean;
}