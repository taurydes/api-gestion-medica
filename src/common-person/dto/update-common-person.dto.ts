import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';
import { CreateCommonPersonDto } from './create-common-person.dto';

/** Partial person patch; names may be omitted but never sent as null (NOT NULL columns). */
export class UpdateCommonPersonDto extends PartialType(
  OmitType(CreateCommonPersonDto, ['firstName', 'lastName'] as const),
) {
  @ApiPropertyOptional({ description: 'Primer nombre (columna "primernombre").', example: 'Juan' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: 'El primer nombre debe ser una cadena de texto' })
  @MaxLength(30, { message: 'El primer nombre no puede superar los 30 caracteres' })
  firstName?: string;

  @ApiPropertyOptional({ description: 'Primer apellido (columna "primerapellido").', example: 'Pérez' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: 'El primer apellido debe ser una cadena de texto' })
  @MaxLength(30, { message: 'El primer apellido no puede superar los 30 caracteres' })
  lastName?: string;
}
