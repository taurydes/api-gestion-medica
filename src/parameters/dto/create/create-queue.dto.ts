import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsNumber,
} from 'class-validator';

export class CreateQueueDto {
  @ApiProperty({
    description: 'Queue name',
    example: 'Customer Support Queue',
  })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Queue description',
    example: 'Queue for handling client support requests',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiProperty({
    description: 'Indicates if the queue is active',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @ApiProperty({
    description: 'Company associated with this queue',
    example: 5,
    required: false,
  })
  @IsOptional()
  @IsNumber({}, { message: 'companyId must be a number' })
  companyId?: number;
}
