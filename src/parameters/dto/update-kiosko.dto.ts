import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

/**
 * @summary DTO for updating a Kiosko entity.
 * @description Contains only optional values because updates are partial.
 */
export class UpdateKioskoDto {
  @ApiPropertyOptional({
    example: 'KIO-002',
    description: 'Updated kiosk code.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  code?: string;

  @ApiPropertyOptional({
    example: 'Updated Kiosk Name',
    description: 'Updated kiosk name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Updated status of the kiosk.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
