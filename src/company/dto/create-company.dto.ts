import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ description: 'Código único de empresa', example: 'EMP-001', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  code?: string;

  @ApiProperty({ description: 'RIF de la empresa', example: 'J-12345678-9', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  rif?: string;

  @ApiProperty({ description: 'Nombre de la empresa', example: 'Publicidad Venezuela' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ description: 'ID del estado', example: 10, required: false })
  @IsOptional()
  @IsNumber()
  stateId?: number;

  @ApiProperty({ description: 'ID del municipio', example: 20, required: false })
  @IsOptional()
  @IsNumber()
  municipalityId?: number;

  @ApiProperty({ description: 'Número de cuenta principal', example: '0102-0123-1234-5678', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  accountNumber?: string;

  @ApiProperty({ description: 'Indica si es filial', example: false })
  @IsOptional()
  @IsBoolean()
  isSubsidiary?: boolean;

  @ApiProperty({ description: 'Indica si maneja comisión', example: false })
  @IsOptional()
  @IsBoolean()
  hasCommission?: boolean;

  @ApiProperty({
    description: 'Cuenta usada para pagar comisiones',
    example: '0102-2222-9999-8888',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  commissionAccountNumber?: string;

  @ApiProperty({ description: 'Indica si la empresa está activa', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
