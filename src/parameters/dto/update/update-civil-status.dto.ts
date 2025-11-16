import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateCivilStatusDto } from '../create/create-civil-status.dto';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateCivilStatusDto extends PartialType(CreateCivilStatusDto) {
  @ApiPropertyOptional({
    description: 'Updated description',
    example: 'Married',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated active status',
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
