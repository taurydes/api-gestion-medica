import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AttachmentDto {
  @ApiProperty({
    example: 'archivo.pdf',
    description: 'Nombre del archivo adjunto',
  })
  @IsString()
  filename: string;

  @ApiProperty({
    example: 'application/pdf',
    description: 'Tipo MIME del archivo',
  })
  @IsString()
  contentType: string;

  @ApiProperty({
    example: 'JVBERi0xLjQKJ...',
    description: 'Contenido en base64',
  })
  @IsString()
  content: string;
}

export class CreateEmailDto {
  @ApiProperty({
    example: 'destinatario@correo.com',
    description: 'Correo del destinatario',
  })
  @IsEmail()
  to: string;

  @ApiProperty({
    example: 'Asunto de prueba',
    description: 'Asunto del correo',
  })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({
    example: 'Contenido del correo',
    description: 'Texto o HTML del correo',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    type: [AttachmentDto],
    required: false,
    description: 'Archivos adjuntos en base64',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

export class SendTemplateEmailDto extends CreateEmailDto {
  @ApiProperty({
    example: {
      name: 'Juan',
      date: '2023-01-01',
      bussines: 'taurydes',
      phone: '041414141441',
      address: 'caracas',
      email: 'taurydes@yopmail.com',
    },
    description: 'Datos para reemplazar en la plantilla segun sea el caso',
  })
  @IsNotEmpty()
  replacements: Record<string, string>;
}
