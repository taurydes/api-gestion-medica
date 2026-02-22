import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  AppointmentStatus,
  AppointmentType,
} from '../entities/medical-appointment.entity';
import { CreatePatientDto } from 'src/patient/dto/create-patient.dto';

export class CreateMedicalAppointmentDto {
  // ─── Identificación del paciente ─────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'ID del paciente ya registrado. Si no se proporciona, se usará documentNumber para buscar o crear.',
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  patientId?: number;

  @ApiPropertyOptional({
    description:
      'Número de documento del paciente. Usado cuando no se proporciona patientId para buscar o crear el paciente.',
    example: '12345678',
  })
  @ValidateIf((o) => !o.patientId)
  @IsNotEmpty({
    message:
      'Se requiere documentNumber o patientId para identificar al paciente.',
  })
  @IsString()
  documentNumber?: string;

  @ApiPropertyOptional({
    description: 'Letra del tipo de documento (ej: V, E, P)',
    example: 'V',
  })
  @IsOptional()
  @IsString()
  documentLetter?: string;

  @ApiPropertyOptional({
    description:
      'Datos del nuevo paciente. Requerido si el paciente no existe en el sistema.',
    type: () => CreatePatientDto,
  })
  @IsOptional()
  @Type(() => CreatePatientDto)
  newPatientData?: CreatePatientDto;

  // ─── Datos de la cita ─────────────────────────────────────────────────────

  @ApiProperty({
    description: 'ID del médico asignado a la cita',
    example: 1,
  })
  @IsNotEmpty({ message: 'El ID del médico es requerido.' })
  @Type(() => Number)
  @IsInt()
  doctorId: number;

  @ApiPropertyOptional({
    description: 'ID de la especialidad médica',
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  specialtyId?: number;

  @ApiPropertyOptional({
    description: 'ID del centro médico',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  medicalCenterId?: number;

  @ApiPropertyOptional({
    description: 'ID del departamento médico',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiProperty({
    description: 'Fecha y hora de la cita (ISO 8601)',
    example: '2026-03-15T09:00:00.000Z',
  })
  @IsNotEmpty({ message: 'La fecha de la cita es requerida.' })
  @IsDateString()
  appointmentDate: string;

  @ApiPropertyOptional({
    description: 'Duración de la cita en minutos (default: 30)',
    example: 30,
    default: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  durationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Estado inicial de la cita',
    enum: AppointmentStatus,
    default: AppointmentStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiProperty({
    description: 'Tipo de consulta',
    enum: AppointmentType,
    default: AppointmentType.FIRST_VISIT,
  })
  @IsNotEmpty({ message: 'El tipo de cita es requerido.' })
  @IsEnum(AppointmentType)
  type: AppointmentType;

  @ApiProperty({
    description: 'Motivo de la consulta',
    example: 'Dolor de cabeza persistente y mareos.',
  })
  @IsNotEmpty({ message: 'El motivo de la cita es requerido.' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({
    description: 'Observaciones adicionales',
    example: 'Paciente refiere alergia a la penicilina.',
  })
  @IsOptional()
  @IsString()
  observations?: string;
}
