import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateRecipeDto } from './create-recipe.dto';

/** Editable recipe fields; history, patient, doctor and appointment stay those of the consultation. */
export class UpdateRecipeDto extends PartialType(
  OmitType(CreateRecipeDto, ['medicalHistoryId', 'patientId', 'doctorId', 'medicalAppointmentId'] as const),
) {}
