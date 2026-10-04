import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { PASSWORD_MIN_LENGTH, passwordMinLengthMessage } from 'src/common/validation/password-policy';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Contraseña temporal; el usuario debe cambiarla al entrar', example: 'Temporal2026', minLength: PASSWORD_MIN_LENGTH })
  @IsString({ message: 'La contraseña temporal debe ser una cadena de texto' })
  @MinLength(PASSWORD_MIN_LENGTH, { message: passwordMinLengthMessage('La contraseña temporal') })
  newPassword: string;
}
