import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Editable fields of a catalog action; `name` is accepted only unchanged because guards match on it. */
export class UpdatePermissionDto {
  @ApiPropertyOptional({
    description: 'Nombre de la acción (crear, consultar, ...). Solo se acepta el valor actual',
    example: 'consultar',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: 'Nombre visible del permiso', example: 'Consultar' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Permiso activo', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Orden de visualización', example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ description: 'Permiso requerido', example: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Tipo de control en la UI', example: 'checkbox' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  controlType?: string;
}
