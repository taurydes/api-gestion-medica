import { ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsOptional, ValidateNested } from 'class-validator';
import { CreateCommonPersonDto } from 'src/common-person/dto/create-common-person.dto';

export class UpdateProfileCommonPersonDto extends PartialType(
  PickType(CreateCommonPersonDto, [
    'firstName',
    'middleName',
    'lastName',
    'secondLastName',
    'photoUrl',
    'phoneNumber',
  ] as const),
) {}

/** Datos que el usuario autenticado puede cambiar de sí mismo: sin rol, estado ni contraseña. */
export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Correo electrónico', example: 'juan@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Debe ser un correo electrónico válido' })
  email?: string;

  @ApiPropertyOptional({ type: UpdateProfileCommonPersonDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateProfileCommonPersonDto)
  commonPerson?: UpdateProfileCommonPersonDto;
}
