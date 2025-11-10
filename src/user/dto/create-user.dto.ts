import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNumber, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Nombre',
    example: 'Juan',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  name: string;

  @ApiProperty({
    description: 'Correo electrónico del usuario',
    example: 'juan@example.com',
    uniqueItems: true,
  })
  @IsEmail({}, { message: 'Debe ser un correo electrónico válido' })
  email: string;

  @ApiProperty({
    description: 'Contraseña del usuario',
    example: 'password123',
    minLength: 6,
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @ApiProperty({
    description: 'Documento de identidad',
    example: 123456789,
  })
  @IsNumber({}, { message: 'El documento debe ser un número' })
  document: number;

  @ApiProperty({
    description: 'Primer nombre',
    example: 'Juan',
  })
  @IsString({ message: 'El primer nombre debe ser una cadena de texto' })
  @Length(1, 30, { message: 'El primer nombre debe tener entre 1 y 30 caracteres' })
  firstName: string;

  @ApiProperty({
    description: 'Segundo nombre (opcional)',
    example: 'Carlos',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'El segundo nombre debe ser una cadena de texto' })
  @Length(1, 30, { message: 'El segundo nombre debe tener entre 1 y 30 caracteres' })
  middleName?: string;

  @ApiProperty({
    description: 'Primer apellido',
    example: 'Pérez',
  })
  @IsString({ message: 'El primer apellido debe ser una cadena de texto' })
  @Length(1, 30, { message: 'El primer apellido debe tener entre 1 y 30 caracteres' })
  lastName: string;

  @ApiProperty({
    description: 'Segundo apellido (opcional)',
    example: 'Gómez',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'El segundo apellido debe ser una cadena de texto' })
  @Length(1, 30, { message: 'El segundo apellido debe tener entre 1 y 30 caracteres' })
  secondLastName?: string;

  @ApiProperty({
    description: 'Teléfono móvil',
    example: '3001234567',
  })
  @IsString({ message: 'El teléfono móvil debe ser una cadena de texto' })
  @Length(1, 20, { message: 'El teléfono móvil debe tener entre 1 y 20 caracteres' })
  mobilePhone: string;

  @ApiProperty({
    description: 'Dirección de residencia',
    example: 'Calle 123 #45-67',
  })
  @IsString({ message: 'La dirección de residencia debe ser una cadena de texto' })
  @Length(1, 255, { message: 'La dirección de residencia debe tener entre 1 y 255 caracteres' })
  homeAddress: string;

  @ApiProperty({
    description: 'Dirección de trabajo (opcional)',
    example: 'Carrera 45 #67-89',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'La dirección de trabajo debe ser una cadena de texto' })
  @Length(1, 255, { message: 'La dirección de trabajo debe tener entre 1 y 255 caracteres' })
  workAddress?: string;

  @ApiProperty({
    description: 'Activo',
    example: true,
  })
  @IsBoolean({ message: 'El estado activo debe ser un valor booleano' })
  activo: boolean;

  @ApiProperty({
    description: 'Usuario interno',
    example: true,
  })
  @IsBoolean({ message: 'El usuario interno debe ser un valor booleano' })
  internalUser: boolean;

  @ApiProperty({
    description: 'ID del rol',
    example: 1,
  })
  @IsNumber({}, { message: 'El ID del rol debe ser un número' })
  roleId: number;

  @ApiProperty({
    description: 'Letra asociada al usuario',
    example: 'A',
  })
  @IsString({ message: 'La letra debe ser una cadena de texto' })
  @Length(1, 1, { message: 'La letra debe tener exactamente 1 carácter' })
  letter: string;

  @ApiProperty({
    description: 'ID de la institución (opcional)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber({}, { message: 'El ID de la institución debe ser un número' })
  institutionId?: number;

  @ApiProperty({
    description: 'ID de la parroquia (opcional)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber({}, { message: 'El ID de la parroquia debe ser un número' })
  parishId?: number;

  @ApiProperty({
    description: 'Contraseña temporal',
    example: false,
  })
  @IsBoolean({ message: 'La contraseña temporal debe ser un valor booleano' })
  temporaryPassword: boolean;

  @ApiProperty({
    description: 'ID de la dirección regional (opcional)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber({}, { message: 'El ID de la dirección regional debe ser un número' })
  regionalAddressId?: number;
}