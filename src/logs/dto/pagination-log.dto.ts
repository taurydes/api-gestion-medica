import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';

export class PaginationLogDto extends QueryPaginationDto {
  @ApiProperty({
    required: false,
    example: 500,
    description: 'Código HTTP de la excepción',
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  statusCode?: number;

  @ApiProperty({
    required: false,
    example: 'Timeout',
    description: 'Texto que debe contener el mensaje',
  })
  @IsOptional()
  @IsString()
  messageContains?: string;

  @ApiProperty({
    required: false,
    example: '/bio-payment',
    description: 'Ruta solicitada',
  })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiProperty({
    required: false,
    example: 'NotFoundException',
    description: 'Nombre de la clase de excepción',
  })
  @IsOptional()
  @IsString()
  exceptionType?: string;

  @ApiProperty({ required: false, example: 'POST', description: 'Método HTTP' })
  @IsOptional()
  @IsString()
  httpMethod?: string;

  @ApiProperty({
    required: false,
    example: 102,
    description: 'ID de usuario asociado',
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId?: number;

  @ApiProperty({
    required: false,
    example: '1d9d4d5e-7c6f-4e5d-9c2b-123456789abc',
    description: 'Correlation ID (uuid)',
  })
  @IsOptional()
  @IsUUID()
  correlationId?: string;

  @ApiProperty({
    required: false,
    example: 'localhost:3000',
    description: 'Host de la petición',
  })
  @IsOptional()
  @IsString()
  host?: string;

  @ApiProperty({
    required: false,
    example: '1.0.3',
    description: 'Versión de la aplicación',
  })
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiProperty({
    required: false,
    example: ['exception', 'critical'],
    description: 'Etiquetas del log',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    required: false,
    example: true,
    description: 'Indica si la excepción fue manejada',
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  handled?: boolean;

  @ApiProperty({
    required: false,
    example: '2025-10-16',
    description: 'Fecha inicial (inclusive)',
  })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiProperty({
    required: false,
    example: '2025-10-17',
    description: 'Fecha final (inclusive)',
  })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiProperty({
    required: false,
    example: 'occurredAt',
    description: 'Campo para ordenar',
  })
  @IsOptional()
  @IsString()
  orderBy?: string;

  @ApiProperty({
    required: false,
    example: 'DESC',
    description: 'Dirección de ordenamiento',
  })
  @IsOptional()
  @IsString()
  orderDir?: 'ASC' | 'DESC';
}
