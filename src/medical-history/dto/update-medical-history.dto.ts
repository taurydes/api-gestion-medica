import { PartialType } from '@nestjs/swagger';
import { CreateMedicalHistoryDto } from './create-medical-history.dto';

/**
 * DTO para actualizar un registro de historial médico existente
 * Todos los campos son opcionales
 */
export class UpdateMedicalHistoryDto extends PartialType(CreateMedicalHistoryDto) {}
