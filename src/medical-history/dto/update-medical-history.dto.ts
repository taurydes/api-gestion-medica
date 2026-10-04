import { ApiHideProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsEmpty } from 'class-validator';
import { CreateMedicalHistoryDto } from './create-medical-history.dto';

const FIXED_LINK = 'no se puede cambiar: la historia queda ligada a su paciente, médico y cita.';

/** Clinical fields of an existing history; patient, doctor and appointment are fixed (MJ-27). */
export class UpdateMedicalHistoryDto extends PartialType(
  OmitType(CreateMedicalHistoryDto, ['patientId', 'doctorId', 'medicalAppointmentId'] as const),
) {
  // Declared only to reject them with 400: with whitelist they would be dropped silently.
  @ApiHideProperty()
  @IsEmpty({ message: `patientId ${FIXED_LINK}` })
  patientId?: never;

  @ApiHideProperty()
  @IsEmpty({ message: `doctorId ${FIXED_LINK}` })
  doctorId?: never;

  @ApiHideProperty()
  @IsEmpty({ message: `medicalAppointmentId ${FIXED_LINK}` })
  medicalAppointmentId?: never;
}
