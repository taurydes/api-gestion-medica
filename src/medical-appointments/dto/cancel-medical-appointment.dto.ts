import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelMedicalAppointmentDto {
  @ApiProperty({ example: 'El paciente no pudo asistir.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El motivo de cancelación es requerido.' })
  @MaxLength(500, { message: 'El motivo de cancelación no puede superar 500 caracteres.' })
  cancellationReason: string;
}
