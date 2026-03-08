import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
    description: 'User ID creating the record (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsNotEmpty({ message: 'userId is required' })
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId: string;
}
