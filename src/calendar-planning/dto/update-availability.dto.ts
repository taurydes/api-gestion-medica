import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * @summary DTO para actualizar disponibilidad.
 * @description Permite modificar descripción y estatus.
 */
export class UpdateAvailabilityDto {
  /** Nueva descripción (opcional) */
  @ApiProperty({
    description: 'Descripción de la disponibilidad (opcional)',
    example: 'Bloque ajustado para horario matutino',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  /** Nuevo estatus (opcional) */
  @ApiProperty({
    description: 'Estatus activo/inactivo (opcional)',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}