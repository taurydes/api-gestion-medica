import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, MaxLength } from 'class-validator';

export class SendEmailDto {
  @ApiPropertyOptional({
    description: 'Destinatario; si se omite, el correo del paciente',
    example: 'paciente@example.com',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsEmail(
    {},
    { message: 'El destinatario debe ser un correo electrónico válido.' },
  )
  @MaxLength(255)
  to?: string;
}
