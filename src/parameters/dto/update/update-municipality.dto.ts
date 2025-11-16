import { PartialType } from '@nestjs/swagger';
import { CreateMunicipalityDto } from '../create/create-municipality.dto';

export class UpdateMunicipalityDto extends PartialType(CreateMunicipalityDto) {}
