import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { QueryPaginationDto } from 'src/common/dto/query-pagination.dto';
import {
  AppointmentStatus,
  AppointmentType,
} from '../entities/medical-appointment.entity';

export class QueryMedicalAppointmentDto extends QueryPaginationDto {
  @ApiPropertyOptional({
    description: 'Buscar por nombre/documento del paciente o número de cita',
    example: 'García',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de paciente (UUID)',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por ID de médico (UUID)' })
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de especialidad (UUID)',
  })
  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de centro médico (UUID)',
  })
  @IsOptional()
  @IsUUID()
  medicalCenterId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de departamento (UUID)',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por estado de la cita',
    enum: AppointmentStatus,
    example: AppointmentStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de consulta',
    enum: AppointmentType,
    example: AppointmentType.FIRST_VISIT,
  })
  @IsOptional()
  @IsEnum(AppointmentType)
  type?: AppointmentType;

  @ApiPropertyOptional({
    description: 'Fecha inicio del filtro (ISO 8601)',
    example: '2026-03-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Fecha fin del filtro (ISO 8601)',
    example: '2026-03-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
