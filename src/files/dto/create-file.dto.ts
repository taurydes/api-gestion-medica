import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateFileDto {}

export class UploadFileDto {
  @ApiProperty({ example: 'documento.pdf', description: 'Nombre del archivo' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'JVBERi0xLjQKJ...', description: 'Contenido en base64' })
  @IsString()
  @IsNotEmpty()
  content: string;
}