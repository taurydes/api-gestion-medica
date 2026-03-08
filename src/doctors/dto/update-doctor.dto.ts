import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateDoctorDto } from './create-doctor.dto';

export class UpdateDoctorDto extends PartialType(CreateDoctorDto) {
  @ApiPropertyOptional({
    type: [String],
    description: 'IDs de las especialidades médicas (UUID)',
  })
  @IsOptional()
  @IsUUID('4', { each: true })
  specialtyIds?: string[];
}
