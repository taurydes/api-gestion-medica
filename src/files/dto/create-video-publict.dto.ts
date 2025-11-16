import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber } from 'class-validator';

export class CreateVideoBase64Dto {
  
  @ApiProperty({ example: 'Video promocional' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: 'Publicidad para cliente X', required: false })
  descripcion?: string;

  @ApiProperty({ example: 12, description: 'Duración del video (máx. 30s)' })
  @IsNumber()
  duracion: number;

  @ApiProperty({ example: 2048, required: false })
  @IsNumber()
  tamano?: number;

  @ApiProperty({ example: 5 })
  @IsNumber()
  clienteId: number;

  @ApiProperty({ example: 1 })
  @IsNumber()
  empresaId: number;

  @ApiProperty({ example: 'video.mp4' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ example: 'base64String...', description: 'Archivo codificado en base64' })
  @IsString()
  @IsNotEmpty()
  fileBase64: string;
}

export class CreateVideoMultipartDto {

  @ApiProperty({ example: 'Video promocional' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: 'Publicidad para cliente X', required: false })
  descripcion?: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  clienteId: number;

  @ApiProperty({ example: 1 })
  @IsNumber()
  empresaId: number;

  @ApiProperty({ type: 'string', format: 'binary' })
  file: any;
}

