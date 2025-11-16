import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * @summary DTO para crear un nuevo plan de publicidad.
 * @description Contiene las propiedades requeridas para registrar un plan.
 */
export class CreateAdvertisingPlanDto {
  /** Código único del plan */
  @ApiProperty({
    description: 'Código único del plan de publicidad',
    example: 'PLAN_BASIC_30',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  /** Nombre del plan */
  @ApiProperty({
    description: 'Nombre descriptivo del plan',
    example: 'Plan Básico 30 Segundos',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  /** Descripción opcional */
  @ApiProperty({
    description: 'Descripción detallada del plan (opcional)',
    example: 'Incluye difusión en pantallas principales',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  /** Duración total en segundos (opcional) */
  @ApiProperty({
    description: 'Duración total del contenido permitido en segundos (opcional)',
    example: 1800,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  totalDuration?: number;

  /** Precio del plan */
  @ApiProperty({
    description: 'Precio del plan (decimal)',
    example: 49.99,
  })
  @IsNumber()
  price: number;

  /** Moneda asociada (FK opcional) */
  @ApiProperty({
    description: 'ID de la moneda asociada (opcional)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  currencyId?: number;

  /** Estatus activo (opcional, default true en la entidad) */
  @ApiProperty({
    description: 'Indica si el plan está activo (opcional)',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}