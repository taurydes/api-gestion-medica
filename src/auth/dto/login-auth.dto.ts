import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, MinLength } from 'class-validator';

export class LoginUserDto {
  @ApiProperty({
    description: 'Nombre de usuario o correo electrónico',
    example: 'admin',
  })
  @IsString({
    message: 'Debe ingresar un correo electrónico o nombre de usuario',
  })
  credential: string; // Puede ser email o name

  @ApiProperty({
    description: 'Contraseña del usuario',
    example: '123456',
    minLength: 6,
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @ApiProperty({
    description: '¿Es un usuario del sistema?',
    example: true,
    default: false,
  })
  @IsBoolean({ message: 'Debe ser verdadero o falso' })
  isSystemUser: boolean;
}
