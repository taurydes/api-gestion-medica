import { ApiHideProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsEmpty } from 'class-validator';
import { CreateMedicalAppointmentDto } from './create-medical-appointment.dto';

export class UpdateMedicalAppointmentDto extends PartialType(
  OmitType(CreateMedicalAppointmentDto, ['status'] as const),
) {
  // Declared only to reject it with 400: with whitelist it would be dropped silently.
  @ApiHideProperty()
  @IsEmpty({
    message:
      'El estado de la cita no se cambia por este endpoint. Use /confirm, /start-consultation, /cancel o /finish-consultation.',
  })
  status?: never;

  @ApiHideProperty()
  @IsEmpty({ message: 'Para cancelar la cita use PATCH /medical-appointments/:id/cancel.' })
  cancellationReason?: never;
}
