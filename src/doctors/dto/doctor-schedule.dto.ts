import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsInt,
  Min,
  Max,
  IsString,
  Matches,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// HH:mm or HH:mm:ss (what GET returns); normalized to HH:mm:ss so string comparisons with stored values hold.
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const TIME_MESSAGE = 'debe tener formato HH:mm o HH:mm:ss (00:00 a 23:59)';
const toStoredTime = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;

/** Un bloque horario individual */
export class ScheduleBlockDto {
  @ApiProperty({ description: 'Día de la semana: 0=Domingo, 1=Lunes, ..., 6=Sábado', example: 1 })
  @IsInt({ message: 'dayOfWeek debe ser un entero' })
  @Min(0, { message: 'dayOfWeek mínimo es 0 (Domingo)' })
  @Max(6, { message: 'dayOfWeek máximo es 6 (Sábado)' })
  dayOfWeek: number;

  @ApiProperty({ description: 'Hora de inicio (HH:mm o HH:mm:ss)', example: '08:00' })
  @Transform(toStoredTime)
  @IsString()
  @Matches(TIME_PATTERN, { message: `startTime ${TIME_MESSAGE}` })
  startTime: string;

  @ApiProperty({ description: 'Hora de fin (HH:mm o HH:mm:ss)', example: '12:00' })
  @Transform(toStoredTime)
  @IsString()
  @Matches(TIME_PATTERN, { message: `endTime ${TIME_MESSAGE}` })
  endTime: string;

  @ApiPropertyOptional({ description: 'Duración del slot en minutos', example: 30, default: 30 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(120)
  slotDurationMinutes?: number;

  @ApiPropertyOptional({ description: 'Máximo pacientes por slot', example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPatientsPerSlot?: number;

  @ApiPropertyOptional({ description: 'Máximo de citas por día para este doctor en este centro', example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxDailyAppointments?: number;
}

/** DTO para crear o reemplazar todos los horarios de un doctor en un centro médico */
export class CreateDoctorScheduleDto {
  @ApiProperty({ description: 'ID del doctor' })
  @IsUUID('4', { message: 'doctorId debe ser un UUID válido' })
  doctorId: string;

  @ApiProperty({ description: 'ID del centro médico' })
  @IsUUID('4', { message: 'medicalCenterId debe ser un UUID válido' })
  medicalCenterId: string;

  @ApiProperty({ description: 'Bloques horarios', type: [ScheduleBlockDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleBlockDto)
  blocks: ScheduleBlockDto[];
}

export class UpdateDoctorScheduleBlockDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({ description: 'Hora de inicio (HH:mm o HH:mm:ss)', example: '08:00:00' })
  @IsOptional()
  @Transform(toStoredTime)
  @IsString()
  @Matches(TIME_PATTERN, { message: `startTime ${TIME_MESSAGE}` })
  startTime?: string;

  @ApiPropertyOptional({ description: 'Hora de fin (HH:mm o HH:mm:ss)', example: '12:00:00' })
  @IsOptional()
  @Transform(toStoredTime)
  @IsString()
  @Matches(TIME_PATTERN, { message: `endTime ${TIME_MESSAGE}` })
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(120)
  slotDurationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPatientsPerSlot?: number;

  @ApiPropertyOptional({ description: 'Máximo de citas por día' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxDailyAppointments?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
