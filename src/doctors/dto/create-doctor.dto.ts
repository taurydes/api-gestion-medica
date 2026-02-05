import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateCommonPersonDto } from 'src/common-person/dto/create-common-person.dto';

export class CreateDoctorDto {
  @ApiProperty({
    type: CreateCommonPersonDto,
    description: 'Datos de la persona común del doctor',
  })
  @ValidateNested()
  @Type(() => CreateCommonPersonDto)
  commonPerson: CreateCommonPersonDto;

  @ApiPropertyOptional({ description: 'ID del centro médico donde trabaja' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  medicalCenterId?: number;

  @ApiProperty({ description: 'Especialidad médica' })
  @IsString()
  @MaxLength(255)
  specialty: string;

  @ApiProperty({ description: 'Número de licencia o matrícula profesional' })
  @IsString()
  @MaxLength(100)
  licenseNumber: string;

  @ApiPropertyOptional({ description: 'Estado activo/inactivo', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
