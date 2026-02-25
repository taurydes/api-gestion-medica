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
  @ApiPropertyOptional({
    type: CreateCommonPersonDto,
    description: 'Datos de la persona común del doctor',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCommonPersonDto)
  commonPerson?: CreateCommonPersonDto;

  @ApiProperty({
    type: [Number],
    description: 'IDs de las especialidades médicas',
  })
  @IsNumber({}, { each: true })
  specialtyIds: number[];

  @ApiPropertyOptional({
    type: [Number],
    description: 'IDs de los centros médicos',
  })
  @IsOptional()
  @IsNumber({}, { each: true })
  medicalCenterIds?: number[];

  @ApiProperty({ description: 'Número de licencia o matrícula profesional' })
  @IsString()
  @MaxLength(100)
  licenseNumber: string;

  @ApiPropertyOptional({ description: 'Estado activo/inactivo', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
