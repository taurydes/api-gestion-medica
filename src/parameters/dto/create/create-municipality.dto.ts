import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateMunicipalityDto {
  @ApiProperty({ description: 'State ID associated to the municipality' })
  @IsInt()
  @Min(1)
  stateId: number;

  @ApiProperty({ description: 'Municipality description' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Whether the municipality is active', default: true })
  @IsOptional()
  isActive?: boolean = true;
}
