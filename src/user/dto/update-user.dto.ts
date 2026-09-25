import { ApiHideProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsEmpty } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  // Declarado solo para rechazarlo con 400: con whitelist se descartaría en silencio.
  @ApiHideProperty()
  @IsEmpty({
    message:
      'La contraseña no se puede cambiar por este endpoint. Use PATCH /auth/change-password',
  })
  password?: never;
}
