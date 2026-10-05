import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID, Matches } from 'class-validator';

// Calendar day only: '22-12-2026' or a full ISO timestamp used to slip through as an empty grid.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = (field: string) => `${field} debe tener el formato YYYY-MM-DD.`;

export class AvailabilityQueryDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID('all', { message: 'doctorId debe ser un UUID.' })
  doctorId: string;

  @ApiProperty({ example: '2026-03-15' })
  @Matches(DATE_ONLY, { message: DATE_MESSAGE('date') })
  @IsDateString({ strict: true }, { message: DATE_MESSAGE('date') })
  date: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID('all', { message: 'medicalCenterId debe ser un UUID.' })
  medicalCenterId?: string;
}

export class AvailableDatesQueryDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID('all', { message: 'doctorId debe ser un UUID.' })
  doctorId: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID('all', { message: 'medicalCenterId debe ser un UUID.' })
  medicalCenterId: string;

  @ApiProperty({ example: '2026-03-01' })
  @Matches(DATE_ONLY, { message: DATE_MESSAGE('startDate') })
  @IsDateString({ strict: true }, { message: DATE_MESSAGE('startDate') })
  startDate: string;

  @ApiProperty({ example: '2026-03-31' })
  @Matches(DATE_ONLY, { message: DATE_MESSAGE('endDate') })
  @IsDateString({ strict: true }, { message: DATE_MESSAGE('endDate') })
  endDate: string;
}
