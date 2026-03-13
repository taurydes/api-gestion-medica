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
import { Type } from 'class-transformer';

/** Un bloque horario individual */
export class ScheduleBlockDto {
  @ApiProperty({ description: 'Día de la semana: 0=Domingo, 1=Lunes, ..., 6=Sábado', example: 1 })
  @IsInt({ message: 'dayOfWeek debe ser un entero' })
  @Min(0, { message: 'dayOfWeek mínimo es 0 (Domingo)' })
  @Max(6, { message: 'dayOfWeek máximo es 6 (Sábado)' })
  dayOfWeek: number;

  @ApiProperty({ description: 'Hora de inicio (HH:mm)', example: '08:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime debe tener formato HH:mm' })
  startTime: string;

  @ApiProperty({ description: 'Hora de fin (HH:mm)', example: '12:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime debe tener formato HH:mm' })
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
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
