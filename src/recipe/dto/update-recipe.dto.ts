import { PartialType, OmitType } from '@nestjs/swagger';
import { IsEmpty } from 'class-validator';
import { CreateRecipeDto } from './create-recipe.dto';

const IMMUTABLE = (field: string) => ({ message: `${field} no se puede cambiar en una receta emitida.` });

/** Editable recipe fields; history, patient, doctor and appointment are rejected (400), not silently dropped (MJ-28). */
export class UpdateRecipeDto extends PartialType(
  OmitType(CreateRecipeDto, ['medicalHistoryId', 'patientId', 'doctorId', 'medicalAppointmentId'] as const),
) {
  @IsEmpty(IMMUTABLE('medicalHistoryId'))
  medicalHistoryId?: never;

  @IsEmpty(IMMUTABLE('patientId'))
  patientId?: never;

  @IsEmpty(IMMUTABLE('doctorId'))
  doctorId?: never;

  @IsEmpty(IMMUTABLE('medicalAppointmentId'))
  medicalAppointmentId?: never;
}
