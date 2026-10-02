import { PartialType, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { UpdateCommonPersonDto } from 'src/common-person/dto/update-common-person.dto';
import { CreateDoctorDto } from './create-doctor.dto';

export class UpdateDoctorDto extends PartialType(OmitType(CreateDoctorDto, ['commonPerson'] as const)) {
  @ApiPropertyOptional({
    type: UpdateCommonPersonDto,
    description: 'Campos de la persona a cambiar; los omitidos no se tocan',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCommonPersonDto)
  commonPerson?: UpdateCommonPersonDto;

  @ApiPropertyOptional({
    type: [String],
    description: 'IDs de las especialidades médicas (UUID)',
  })
  @IsOptional()
  @IsUUID('4', { each: true })
  specialtyIds?: string[];
}
