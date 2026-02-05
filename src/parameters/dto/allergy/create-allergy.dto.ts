import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateAllergyDto {
  @ApiProperty({ description: 'Nombre de la alergia', example: 'Penicilina' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Descripción de la alergia' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Estado activo', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
