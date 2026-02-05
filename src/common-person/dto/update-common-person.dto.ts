import { PartialType } from '@nestjs/swagger';
import { CreateCommonPersonDto } from './create-common-person.dto';

export class UpdateCommonPersonDto extends PartialType(CreateCommonPersonDto) {}
