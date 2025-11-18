// ...existing code...
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';
import { HASH_ALGOS, CIPHER_ALGOS } from '../crypto.const';


const ALL = [...HASH_ALGOS, ...CIPHER_ALGOS] as const;
type AnyAlgorithm = typeof ALL[number];

export class EncryptDto {
  @ApiProperty({ enum: ALL, example: CIPHER_ALGOS[0] })
  @IsIn(ALL)
  type: AnyAlgorithm;

  @ApiProperty({ description: 'Dato a procesar', example: '{"userId":123}' })
  @IsString()
  data: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  passphrase?: string;
}
