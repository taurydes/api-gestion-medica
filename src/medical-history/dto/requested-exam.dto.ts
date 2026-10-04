import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** One exam ordered during the consultation (MJ-31). */
export class RequestedExamDto {
  @ApiProperty({ example: 'Mamografía bilateral' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del examen es requerido.' })
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Control anual' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
