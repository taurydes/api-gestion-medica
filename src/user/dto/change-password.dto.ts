import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { PASSWORD_MIN_LENGTH, passwordMinLengthMessage } from 'src/common/validation/password-policy';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Contraseña actual del usuario', example: 'claveActual1' })
  @IsString({ message: 'La contraseña actual debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña actual es obligatoria' })
  currentPassword: string;

  @ApiProperty({ description: 'Nueva contraseña', example: 'claveNueva1', minLength: PASSWORD_MIN_LENGTH })
  @IsString({ message: 'La nueva contraseña debe ser una cadena de texto' })
  @MinLength(PASSWORD_MIN_LENGTH, { message: passwordMinLengthMessage('La nueva contraseña') })
  newPassword: string;
}
