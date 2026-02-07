import { OmitType } from '@nestjs/swagger';
import { CreateDoctorDto } from './create-doctor.dto';

export class CreateDoctorNestedDto extends OmitType(CreateDoctorDto, [
  'commonPerson',
] as const) {}
