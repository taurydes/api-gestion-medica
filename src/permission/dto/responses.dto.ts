import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SuccessResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}

export class CheckPermissionResponseDto {
  @ApiProperty({ example: true })
  allowed: boolean;

  @ApiPropertyOptional({ example: 'Usuario no tiene permiso Campaign.crear' })
  reason?: string;
}
