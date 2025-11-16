import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateGenderDto } from '../create/create-gender.dto';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGenderDto extends PartialType(CreateGenderDto) {
  @ApiPropertyOptional({
    description: 'Updated description of the gender',
    example: 'Female',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated acronym',
    example: 'F',
  })
  @IsOptional()
  @IsString({ message: 'acronym must be a string' })
  @MaxLength(1, { message: 'acronym must be only 1 character' })
  acronym?: string;

  @ApiPropertyOptional({
    description: 'Updated active status',
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
