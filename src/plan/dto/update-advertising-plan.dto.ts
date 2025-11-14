import { PartialType } from '@nestjs/mapped-types';
import { CreateAdvertisingPlanDto } from './create-advertising-plan.dto';

/**
 * @summary DTO para actualizar un plan de publicidad.
 * @description
 * Hereda todas las propiedades del DTO de creación,
 * pero todas en modo opcional.
 */
export class UpdateAdvertisingPlanDto extends PartialType(CreateAdvertisingPlanDto) {}
