import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateCommonPersonDto {
  @ApiProperty({
    description:
      'Letra del documento / código de tipo de documento (columna "letra"). Opcional.',
    example: 'V',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'La letra debe ser una cadena de texto' })
  @Length(1, 1, { message: 'La letra debe tener exactamente 1 carácter' })
  letter?: string | null;

  @ApiProperty({
    description: 'Número de documento (columna "documento"). Opcional.',
    example: '12345678',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'El número de documento debe ser una cadena de texto' })
  @MaxLength(30, {
    message: 'El número de documento no puede superar los 30 caracteres',
  })
  documentNumber?: string | null;

  @ApiProperty({
    description: 'Primer nombre (columna "primernombre"). Requerido.',
    example: 'Juan',
  })
  @IsString({ message: 'El primer nombre debe ser una cadena de texto' })
  @MaxLength(30, {
    message: 'El primer nombre no puede superar los 30 caracteres',
  })
  firstName: string;

  @ApiProperty({
    description: 'Segundo nombre (columna "segundonombre"). Opcional.',
    example: 'Carlos',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'El segundo nombre debe ser una cadena de texto' })
  @MaxLength(30, {
    message: 'El segundo nombre no puede superar los 30 caracteres',
  })
  middleName?: string | null;

  @ApiProperty({
    description: 'Primer apellido (columna "primerapellido"). Requerido.',
    example: 'Pérez',
  })
  @IsString({ message: 'El primer apellido debe ser una cadena de texto' })
  @MaxLength(30, {
    message: 'El primer apellido no puede superar los 30 caracteres',
  })
  lastName: string;

  @ApiProperty({
    description: 'Segundo apellido (columna "segundoapellido"). Opcional.',
    example: 'Gómez',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'El segundo apellido debe ser una cadena de texto' })
  @MaxLength(30, {
    message: 'El segundo apellido no puede superar los 30 caracteres',
  })
  secondLastName?: string | null;

  @ApiProperty({
    description:
      'Estado de la persona (columna "estatus"). Opcional, por defecto true en BD.',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser un valor booleano' })
  isActive?: boolean;
}
