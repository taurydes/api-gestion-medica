import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, MaxLength } from 'class-validator';

/**
 * @summary DTO for creating a Kiosko entity.
 * @description Represents the required and optional fields used to create a new Kiosko.
 */
export class CreateKioskoDto {
  @ApiProperty({
    example: 'KIO-001',
    description: 'Unique identification code for the kiosk.',
  })
  @IsString()
  @MaxLength(255)
  code: string;

  @ApiProperty({
    example: 'Main Office Kiosk',
    description: 'Readable name for the kiosk.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({
    example: true,
    description: 'Determines if the kiosk is active in the system.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
