import { IsEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Rejects a model output sent by the client: the backend computes it by calling the detector. */
function ServerComputed(): PropertyDecorator {
  return IsEmpty({
    message: ({ property }) =>
      `${property} lo calcula el servidor con el modelo; no se acepta en el cuerpo.`,
  });
}

/** Body of `POST /mammography-analyses`: the backend runs the model on the stored file. */
export class CreateMammographyAnalysisDto {
  @ApiProperty({ description: 'UUID del archivo de cita (appointment_files) a analizar' })
  @IsUUID('all', { message: 'appointmentFileId debe ser un UUID válido.' })
  appointmentFileId: string;

  @ApiPropertyOptional({ description: 'Nota libre del médico' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Si se envía, debe coincidir con la cita del archivo' })
  @IsOptional()
  @IsUUID('all')
  appointmentId?: string;

  @ApiPropertyOptional({ description: 'Si se envía, debe coincidir con el paciente del archivo' })
  @IsOptional()
  @IsUUID('all')
  patientId?: string;

  @ApiPropertyOptional({ description: 'Nombre para mostrar; por defecto, el nombre original del archivo' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceFileName?: string;

  // Resultado del modelo: presente en el cuerpo → 400 (M-39).
  @ServerComputed() prediction?: unknown;
  @ServerComputed() probability?: unknown;
  @ServerComputed() status?: unknown;
  @ServerComputed() label?: unknown;
  @ServerComputed() rawResponseJson?: unknown;
  @ServerComputed() rawResponse?: unknown;
  @ServerComputed() rawScore?: unknown;
  @ServerComputed() malignancyProbability?: unknown;
  @ServerComputed() threshold?: unknown;
  @ServerComputed() modelVersion?: unknown;
}
