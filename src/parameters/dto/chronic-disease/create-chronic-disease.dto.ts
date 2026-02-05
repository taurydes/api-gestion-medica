import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateChronicDiseaseDto {
  @ApiProperty({
    description: 'Nombre de la enfermedad crónica',
    example: 'Diabetes',
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Descripción de la enfermedad' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Estado activo', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
