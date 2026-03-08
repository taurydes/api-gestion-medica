import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateMunicipalityDto {
  @ApiProperty({ description: 'State ID associated to the municipality (UUID)' })
  @IsUUID()
  stateId: string;

  @ApiProperty({ description: 'Municipality description' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Whether the municipality is active', default: true })
  @IsOptional()
  isActive?: boolean = true;
}
