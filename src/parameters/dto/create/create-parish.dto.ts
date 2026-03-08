import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateParishDto {
  @ApiProperty({ description: 'Municipality ID (UUID)' })
  @IsUUID()
  municipalityId: string;

  @ApiProperty({ description: 'Description of the parish' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Active status', default: true })
  @IsOptional()
  isActive?: boolean = true;
}
