import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateCommonPersonDto } from './create-common-person.dto';
import { CreateDoctorNestedDto } from 'src/doctors/dto/create-doctor-nested.dto';

export class CreateUserDto {
  @ApiProperty({
    description: 'Nombre de usuario',
    example: 'juan',
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
    description: 'ID del rol (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID('4', { message: 'El ID del rol debe ser un UUID válido' })
  roleId: string;

  @ApiProperty({
    description: 'Indica si es el primer inicio de sesión',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'firstLogin debe ser un valor booleano' })
  firstLogin?: boolean;

  @ApiProperty({
    description: 'Estado del usuario (activo/inactivo)',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'El estado debe ser un valor booleano' })
  status?: boolean;

  @ApiProperty({
    description: 'Entidad CommonPerson asociada al usuario',
    example: CreateCommonPersonDto,
  })
  @Type(() => CreateCommonPersonDto)
  @IsNotEmpty({ message: 'La información de la persona es obligatoria' })
  commonPerson: CreateCommonPersonDto;

  @ApiPropertyOptional({
    description: 'Datos del doctor (si el usuario es un médico)',
    type: CreateDoctorNestedDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateDoctorNestedDto)
  doctor?: CreateDoctorNestedDto;
}
