import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { CreateMedicalAppointmentDto } from './create-medical-appointment.dto';
import { AppointmentStatus } from '../entities/medical-appointment.entity';

export class UpdateMedicalAppointmentDto extends PartialType(
  CreateMedicalAppointmentDto,
) {
  @ApiPropertyOptional({
    description: 'Nuevo estado de la cita',
    enum: AppointmentStatus,
    example: AppointmentStatus.CONFIRMED,
  })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ApiPropertyOptional({
    description: 'Razón de cancelación (requerida cuando se cancela la cita)',
    example: 'El paciente no pudo asistir por motivos de fuerza mayor.',
  })
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}
