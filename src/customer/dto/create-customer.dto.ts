import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNumber, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateCustomerDto {

  @ApiProperty({ description: 'Customer name', example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Email address', example: 'cliente@mail.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'Phone number', example: '0412-5551234', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Full address', example: 'Av. Libertador #123', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'State ID', example: 1, required: false })
  @IsOptional()
  @IsNumber()
  stateId?: number;

  @ApiProperty({ description: 'Municipality ID', example: 10, required: false })
  @IsOptional()
  @IsNumber()
  municipalityId?: number;

  @ApiProperty({ description: 'Parish ID', example: 15, required: false })
  @IsOptional()
  @IsNumber()
  parishId?: number;

  @ApiProperty({ description: 'Whether the customer is active', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiProperty({ description: 'Company ID that owns the customer', example: 5 })
  @IsNumber()
  companyId: number;

  @ApiProperty({ description: 'Unique letter used for identification', example: 'A-123', required: true })
  @IsString()
  @IsNotEmpty()
  letter: string;

  @ApiProperty({ description: 'Document number', example: 12345678, required: false })
  @IsOptional()
  @IsNumber()
  document?: number;
}
