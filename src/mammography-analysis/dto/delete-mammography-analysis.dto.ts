import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body of `DELETE /mammography-analyses/:id` (MJ-37): the withdrawal needs a reason. */
export class DeleteMammographyAnalysisDto {
  @ApiProperty({ example: 'Se analizó la imagen de otro estudio' })
  @IsString()
  @IsNotEmpty({ message: 'El motivo es requerido.' })
  @MaxLength(500)
  reason: string;
}
