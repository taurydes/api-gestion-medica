import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateRecipeDto } from './create-recipe.dto';

/**
 * DTO para actualizar una receta médica existente
 * No permite actualizar medicalHistoryId, patientId ni doctorId
 */
export class UpdateRecipeDto extends PartialType(
  OmitType(CreateRecipeDto, ['medicalHistoryId', 'patientId', 'doctorId'] as const),
) {}
