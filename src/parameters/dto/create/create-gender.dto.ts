import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGenderDto {
  @ApiProperty({
    description: 'Description of the gender',
    example: 'Male',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiProperty({
    description: 'Acronym of the gender',
    example: 'M',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'acronym must be a string' })
  @MaxLength(1, { message: 'acronym must be only 1 character' })
  acronym?: string;

  @ApiProperty({
    description: 'Indicates if the gender is active',
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
  @IsNotEmpty({ message: 'userId is required' })
  @IsNumber({}, { message: 'userId must be a number' })
  userId: number;
}
