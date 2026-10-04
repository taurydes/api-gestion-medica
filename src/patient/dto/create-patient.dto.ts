import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  MaxLength,
  ValidateNested,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsUUID,
  IsIn,
} from 'class-validator';
import { CreateCommonPersonDto } from 'src/common-person/dto/create-common-person.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const MARITAL_STATUSES = ['soltero', 'casado', 'divorciado', 'viudo', 'union_libre'];

/**
 * DTO para crear un nuevo paciente
 * El código de paciente es opcional y se genera automáticamente si no se proporciona
 */
export class CreatePatientDto {
  @ApiProperty({
    type: CreateCommonPersonDto,
    description: 'Datos de la persona común',
  })
  @ValidateNested()
  @Type(() => CreateCommonPersonDto)
  @IsNotEmpty()
  commonPerson: CreateCommonPersonDto;

  @ApiPropertyOptional({
    description: 'Código del paciente (se genera automáticamente si no se proporciona)',
    example: 'PAC-2026-00001',
  })
  @IsOptional()
  @IsString()
  patientCode?: string;

  // Add other patient specific fields here as optional for now or required based on entity
  // Closed set, the same values the patient form offers (MJ-48).
  @ApiPropertyOptional({ description: 'Estado civil', enum: MARITAL_STATUSES, example: 'soltero' })
  @IsOptional()
  @IsIn(MARITAL_STATUSES, { message: `El estado civil debe ser uno de: ${MARITAL_STATUSES.join(', ')}` })
  maritalStatus?: string;

  @ApiProperty({ description: 'Ocupación', example: 'Ingeniero' })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiProperty({
    description: 'Nombre de contacto de emergencia',
    example: 'Maria Perez',
  })
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiProperty({
    description: 'Teléfono de contacto de emergencia',
    example: '0414-1234567',
  })
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiProperty({
    description: 'Relación con contacto de emergencia',
    example: 'Madre',
  })
  @IsOptional()
  @IsString()
  emergencyContactRelationship?: string;

  @ApiProperty({ description: 'Tipo de sangre', example: 'O+' })
  @IsOptional()
  @IsString()
  bloodType?: string;

  @ApiPropertyOptional({ description: 'Correo de contacto del paciente. "" o null lo borran', example: 'paciente@example.com' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsEmail({}, { message: 'El correo del paciente no es válido' })
  @MaxLength(255)
  email?: string | null;

  @ApiProperty({
    description: 'IDs de alergias (UUID)',
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  allergyIds?: string[];

  @ApiProperty({
    description: 'IDs de enfermedades crónicas (UUID)',
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  chronicDiseaseIds?: string[];

  @ApiProperty({
    description: 'IDs de medicamentos actuales (UUID)',
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  medicationIds?: string[];

  @ApiProperty({
    description: 'Compañía de seguros',
    example: 'Seguros Caracas',
  })
  @IsOptional()
  @IsString()
  insuranceCompany?: string;

  @ApiProperty({ description: 'Número de póliza', example: '12345678' })
  @IsOptional()
  @IsString()
  insurancePolicyNumber?: string;
}
