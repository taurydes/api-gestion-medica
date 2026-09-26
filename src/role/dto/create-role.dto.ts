import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Nombre del rol',
    example: 'Administrador',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del rol es obligatorio' })
  @MaxLength(255, { message: 'El nombre no puede superar los 255 caracteres' })
  name: string;

  @ApiProperty({
    description: 'Indica si el rol está activo',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser un valor booleano' })
  isActive?: boolean;
}
