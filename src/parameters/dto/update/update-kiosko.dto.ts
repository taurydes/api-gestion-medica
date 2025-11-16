import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { CreateKioskoDto } from '../create/create-kiosko.dto';

/**
 * @summary DTO for updating a Kiosko entity.
 * @description Contains only optional values because updates are partial.
 */
export class UpdateKioskoDto extends PartialType(CreateKioskoDto) {
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
