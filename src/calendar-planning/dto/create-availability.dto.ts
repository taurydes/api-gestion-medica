import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * @summary DTO para crear una disponibilidad en el calendario.
 * @description Campos opcionales para registrar bloque de disponibilidad.
 */
export class CreateAvailabilityDto {
  /** Descripción de la disponibilidad (opcional) */
  @ApiProperty({
    description: 'Descripción corta de la disponibilidad (opcional)',
    example: 'Bloque disponible para anuncios nocturnos',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  /** Estatus activo/inactivo (opcional, default true en entidad si aplica) */
  @ApiProperty({
    description: 'Indica si la disponibilidad está activa (opcional)',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}