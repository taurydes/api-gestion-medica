import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsDateString,
  Length,
} from 'class-validator';

export class CreateUserSecurityDto {
  @ApiProperty({ example: 'Carlos Pérez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'carlos@example.com' })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'MiClaveSegura123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password: string;

  @ApiProperty({ example: '04141234567' })
  @IsString()
  @Length(7, 20)
  personalPhone: string;

  @ApiProperty({ example: '02121234567', required: false })
  @IsOptional()
  @IsString()
  @Length(7, 20)
  localPhone?: string | null;

  @ApiProperty({ example: 'Av. Los Leones con calle 8' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  houseAddress: string;

  @ApiProperty({ example: 'Oficina Torre Centro Piso 7', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  workAddress?: string | null;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @ApiProperty({ example: 1 })
  @IsNumber()
  roleId: number;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @IsNumber()
  commonPersonId?: number | null;

  @ApiProperty({ example: '1990-05-20', required: false })
  @IsOptional()
  @IsDateString()
  birthDate?: Date | null;

  @ApiProperty({ example: 1, required: false, description: 'Usuario que crea el registro' })
  @IsOptional()
  @IsNumber()
  userId?: number | null;
  
}
