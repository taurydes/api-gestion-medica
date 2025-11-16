import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateIdentityDocumentDto {
  @ApiProperty({
    description: 'Identity letter (unique)',
    example: 'V',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'letter must be a string' })
  @MaxLength(255)
  letter?: string;

  @ApiProperty({
    description: 'Description of the identity document',
    example: 'Venezuelan ID',
  })
  @IsString({ message: 'description must be a string' })
  @IsNotEmpty({ message: 'description is required' })
  description: string;

  @ApiProperty({
    description: 'Indicates if the record is active',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @ApiProperty({
    description: 'User ID creating the record',
    example: 10,
  })
  @IsNotEmpty({ message: 'userId is required' })
  @IsNumber({}, { message: 'userId must be a number' })
  userId: number;
}
