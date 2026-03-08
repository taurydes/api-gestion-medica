import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsBoolean,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateCommonPersonDto } from 'src/common-person/dto/create-common-person.dto';

export class CreateDoctorDto {
  @ApiPropertyOptional({
    type: CreateCommonPersonDto,
    description: 'Datos de la persona común del doctor',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCommonPersonDto)
  commonPerson?: CreateCommonPersonDto;

  @ApiProperty({
    type: [String],
    description: 'IDs de las especialidades médicas (UUID)',
  })
  @IsUUID('4', { each: true })
  specialtyIds: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'IDs de los centros médicos (UUID)',
  })
  @IsOptional()
  @IsUUID('4', { each: true })
  medicalCenterIds?: string[];

  @ApiProperty({ description: 'Número de licencia o matrícula profesional' })
  @IsString()
  @MaxLength(100)
  licenseNumber: string;

  @ApiPropertyOptional({ description: 'Estado activo/inactivo', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
