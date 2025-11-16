import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateIdentityDocumentDto } from '../create/create-identity-document.dto';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateIdentityDocumentDto extends PartialType(CreateIdentityDocumentDto) {
  @ApiPropertyOptional({
    description: 'Updated letter',
    example: 'E',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  letter?: string;

  @ApiPropertyOptional({
    description: 'Updated description',
    example: 'Foreign ID',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated active status',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
