import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ALL_DECRYPT_ALGOS } from '../crypto.const';

export class DecryptDto {
  @ApiProperty({ enum: ALL_DECRYPT_ALGOS, example: ALL_DECRYPT_ALGOS[0] })
  @IsIn(ALL_DECRYPT_ALGOS)
  type: string;

  @ApiProperty({ description: 'Payload cifrado (string / JSON serializado / base64 laravel)' })
  @IsString()
  payload: string;

  @ApiProperty({ required: false, description: 'Passphrase (no para laravel-aes-cbc)' })
  @IsOptional()
  @IsString()
  passphrase?: string;
}