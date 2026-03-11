/**
 * @fileoverview DTOs de paginación estilo API Go.
 *
 * Este archivo define la estructura de paginación compatible con la API de Go,
 * manteniendo consistencia en las respuestas entre ambos sistemas.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, Max } from 'class-validator';

// =============================================================================
// REQUEST DTOs
// =============================================================================

/**
 * Query DTO para solicitudes paginadas.
 * Compatible con la estructura de Go: ?page=1&limit=10
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Número de página (1-indexed)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, description: 'Cantidad de resultados por página', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

/**
 * Query DTO extendido con filtro de estado activo.
 */
export class PaginationWithActiveDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'true', description: 'Filtrar solo activos' })
  @IsOptional()
  activeOnly?: string;
}

// =============================================================================
// RESPONSE DTOs
// =============================================================================

/**
 * Respuesta paginada genérica estilo Go.
 *
 * Estructura compatible con:
 * ```json
 * {
 *   "count": 100,
 *   "pageNumber": 1,
 *   "numPages": 10,
 *   "perPage": 10,
 *   "next": "/api/casl/modules?page=2&limit=10",
 *   "previous": "",
 *   "results": [...]
 * }
 * ```
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({ example: 100, description: 'Total de registros' })
  count: number;

  @ApiProperty({ example: 1, description: 'Página actual' })
  pageNumber: number;

  @ApiProperty({ example: 10, description: 'Total de páginas' })
  numPages: number;

  @ApiProperty({ example: 10, description: 'Registros por página' })
  perPage: number;

  @ApiProperty({ example: '/api/casl/modules?page=2&limit=10', description: 'URL de la siguiente página' })
  next: string;

  @ApiProperty({ example: '', description: 'URL de la página anterior' })
  previous: string;

  @ApiProperty({ description: 'Array de resultados', isArray: true })
  results: T[];
}

// =============================================================================
// HELPER FUNCTION
// =============================================================================

/**
 * Construye una respuesta paginada estilo Go.
 *
 * @param data - Datos obtenidos de la consulta
 * @param count - Total de registros (sin paginar)
 * @param page - Página actual (1-indexed)
 * @param limit - Registros por página
 * @param basePath - Ruta base del endpoint (ej: '/api/casl/modules')
 */
export function buildPaginatedResponse<T>(
  data: T[],
  count: number,
  page: number,
  limit: number,
  basePath: string,
): PaginatedResponseDto<T> {
  const numPages = Math.ceil(count / limit);

  let next = '';
  let previous = '';

  if (page < numPages) {
    next = `${basePath}?page=${page + 1}&limit=${limit}`;
  }

  if (page > 1) {
    previous = `${basePath}?page=${page - 1}&limit=${limit}`;
  }

  return {
    count,
    pageNumber: page,
    numPages,
    perPage: limit,
    next,
    previous,
    results: data,
  };
}
