
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCivilStatusDto {
  @ApiProperty({
    description: 'Description of the civil status',
    example: 'Single',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiProperty({
    description: 'Indicates if the civil status is active',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @ApiProperty({
    description: 'ID of the user creating this record',
    example: 10,
  })
  @IsNumber({}, { message: 'userId must be a number' })
  @IsNotEmpty({ message: 'userId is required' })
  userId: number;
}
