import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Resumen de un centro médico devuelto en la respuesta de /auth/me.
 * Solo expone los campos necesarios para que el frontend filtre el contexto
 * del usuario; no incluye relaciones ni campos de infraestructura.
 */
export class MedicalCenterSummaryDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'UUID del centro médico',
  })
  id: string;

  @ApiProperty({
    example: 'Clínica Santa María',
    description: 'Nombre del centro médico',
  })
  name: string;

  @ApiPropertyOptional({
    example: 'Av. Principal 123, Sede Central',
    description: 'Dirección del centro médico',
    nullable: true,
  })
  address: string | null;

  @ApiProperty({
    example: true,
    description: 'Indica si el centro médico está activo',
  })
  isActive: boolean;
}
