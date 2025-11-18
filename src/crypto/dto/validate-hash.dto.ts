import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsString } from 'class-validator';
import { HASH_ALGOS, HashAlgorithm } from '../crypto.const';


export class ValidateHashDto {
  @ApiProperty({ enum: HASH_ALGOS, example: HASH_ALGOS[1] })
  @IsIn(HASH_ALGOS)
  type: HashAlgorithm;

  @ApiProperty({ description: 'Contenido original', example: 'hola-mundo' })
  @IsString()
  data: string;

  @ApiProperty({ description: 'Hash a verificar', example: 'e69e23...' })
  @IsString()
  hash: string;
}
   