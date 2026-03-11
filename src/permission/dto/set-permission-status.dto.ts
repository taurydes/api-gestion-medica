import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Body DTO: Activar/Desactivar un permiso.
 */
export class SetPermissionStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}
