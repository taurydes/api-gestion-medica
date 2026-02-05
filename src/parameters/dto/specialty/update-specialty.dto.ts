import { PartialType } from '@nestjs/swagger';
import { CreateSpecialtyDto } from './create-specialty.dto';

/**
 * DTO para actualizar una especialidad médica existente
 * Todos los campos son opcionales
 */
export class UpdateSpecialtyDto extends PartialType(CreateSpecialtyDto) {}
