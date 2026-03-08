import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * DTO para crear un ítem de receta médica
 */
export class CreateRecipeItemDto {
  @ApiPropertyOptional({
    description: 'ID del medicamento del catálogo (UUID, opcional)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  medicationId?: string;

  @ApiProperty({
    description: 'Nombre del medicamento',
    example: 'Ibuprofeno',
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del medicamento es requerido' })
  @MaxLength(255)
  medicationName: string;

  @ApiPropertyOptional({
    description: 'Presentación del medicamento',
    example: 'Tabletas',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  presentation?: string;

  @ApiPropertyOptional({
    description: 'Concentración del medicamento',
    example: '400mg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  concentration?: string;

  @ApiProperty({
    description: 'Cantidad prescrita',
    example: 20,
  })
  @IsNumber()
  @IsNotEmpty({ message: 'La cantidad es requerida' })
  quantity: number;

  @ApiPropertyOptional({
    description: 'Unidad de medida',
    example: 'tabletas',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiProperty({
    description: 'Dosis a administrar',
    example: '1 tableta',
  })
  @IsString()
  @IsNotEmpty({ message: 'La dosis es requerida' })
  @MaxLength(100)
  dosage: string;

  @ApiProperty({
    description: 'Frecuencia de administración',
    example: 'Cada 8 horas',
  })
  @IsString()
  @IsNotEmpty({ message: 'La frecuencia es requerida' })
  @MaxLength(100)
  frequency: string;

  @ApiPropertyOptional({
    description: 'Duración del tratamiento',
    example: '7 días',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  duration?: string;

  @ApiPropertyOptional({
    description: 'Vía de administración',
    example: 'Oral',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  route?: string;

  @ApiPropertyOptional({
    description: 'Instrucciones específicas',
    example: 'Tomar con alimentos para evitar malestar estomacal',
  })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional({
    description: 'Orden de aparición en la receta',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  orderNumber?: number;
}
