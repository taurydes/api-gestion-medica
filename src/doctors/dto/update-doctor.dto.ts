import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber } from 'class-validator';
import { CreateDoctorDto } from './create-doctor.dto';

export class UpdateDoctorDto extends PartialType(CreateDoctorDto) {
  @ApiPropertyOptional({
    type: [Number],
    description: 'IDs de las especialidades médicas',
  })
  @IsOptional()
  @IsNumber({}, { each: true })
  specialtyIds?: number[];
}
