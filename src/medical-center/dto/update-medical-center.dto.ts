import { PartialType } from '@nestjs/swagger';
import { CreateMedicalCenterDto } from './create-medical-center.dto';

export class UpdateMedicalCenterDto extends PartialType(CreateMedicalCenterDto) {}
