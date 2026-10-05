import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  AppointmentStatus,
  AppointmentType,
} from '../entities/medical-appointment.entity';
import { CreatePatientDto } from 'src/patient/dto/create-patient.dto';

// Later statuses are reached only through their dedicated endpoints.
const INITIAL_APPOINTMENT_STATUSES = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];

export class CreateMedicalAppointmentDto {
  // ─── Identificación del paciente ─────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'ID del paciente ya registrado (UUID). Si no se proporciona, se usará documentNumber para buscar o crear.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

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
    description: 'ID del médico asignado a la cita (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsNotEmpty({ message: 'El ID del médico es requerido.' })
  @IsUUID()
  doctorId: string;

  @ApiPropertyOptional({
    description: 'ID de la especialidad médica (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  // Required: schedule, slots and daily cap are configured per center (MJ-24).
  @ApiProperty({
    description: 'ID del centro médico (UUID). El médico debe estar asignado al centro.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  // One message whether missing or malformed (IsUUID also rejects undefined).
  @IsUUID('all', { message: 'Indique el centro médico de la cita.' })
  medicalCenterId: string;

  @ApiPropertyOptional({
    description: 'ID del departamento médico (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

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
    description: 'Estado inicial de la cita (solo pending o confirmed)',
    enum: INITIAL_APPOINTMENT_STATUSES,
    default: AppointmentStatus.PENDING,
  })
  @IsOptional()
  @IsIn(INITIAL_APPOINTMENT_STATUSES, {
    message: 'Una cita nueva solo puede crearse como pendiente (pending) o confirmada (confirmed).',
  })
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
  @MaxLength(500, { message: 'El motivo de la cita no puede superar 500 caracteres.' })
  reason: string;

  @ApiPropertyOptional({
    description: 'Observaciones adicionales',
    example: 'Paciente refiere alergia a la penicilina.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Las observaciones no pueden superar 2000 caracteres.' })
  observations?: string;
}
