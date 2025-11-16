import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateParishDto {
  @ApiProperty({ description: 'Municipality ID' })
  @IsInt()
  @Min(1)
  municipalityId: number;

  @ApiProperty({ description: 'Description of the parish' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Active status', default: true })
  @IsOptional()
  isActive?: boolean = true;
}
