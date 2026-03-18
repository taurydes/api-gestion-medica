import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  MaxLength,
  IsNumber,
  IsUUID,
} from 'class-validator';

export class CreateMedicalCenterDto {
  @ApiProperty({ description: 'Nombre del centro médico' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Dirección del centro médico' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Teléfono de contacto' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico del centro',
    example: 'centromedico@gmail.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ description: 'Estado activo/inactivo', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Parroquia ID (UUID)', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID()
  parishId?: string;

  @ApiPropertyOptional({ description: 'Número de camillas', default: 0 })
  @IsOptional()
  @IsNumber()
  numBeds?: number;

  @ApiPropertyOptional({ description: 'Número de quirófanos', default: 0 })
  @IsOptional()
  @IsNumber()
  numOperatingRooms?: number;

  @ApiPropertyOptional({ description: '¿Tiene emergencia?', default: false })
  @IsOptional()
  @IsBoolean()
  hasEmergency?: boolean;

  @ApiPropertyOptional({
    description: '¿Tiene hospitalización?',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  hasHospitalization?: boolean;

  @ApiPropertyOptional({
    description: '¿Tiene cuidados intensivos?',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  hasIntensiveCare?: boolean;

  @ApiPropertyOptional({
    description: '¿Tiene estacionamiento?',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  hasParking?: boolean;

  @ApiPropertyOptional({ description: '¿Tiene farmacia?', default: false })
  @IsOptional()
  @IsBoolean()
  hasPharmacy?: boolean;

  @ApiPropertyOptional({ description: '¿Tiene laboratorio?', default: false })
  @IsOptional()
  @IsBoolean()
  hasLaboratory?: boolean;

  @ApiPropertyOptional({
    description: 'URL de la imagen del centro médico. Opcional.',
    example: 'http://localhost:3000/uploads/medical-centers/1234567890-abc123.jpg',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string | null;
}
