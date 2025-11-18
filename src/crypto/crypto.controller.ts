// ...existing code...
import { Body, Controller, Post, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { ALL_DECRYPT_ALGOS, CIPHER_ALGOS, HASH_ALGOS, HashAlgorithm } from './crypto.const';
import { CryptoService } from './crypto.service';
import { DecryptDto } from './dto/decrypt.dto';
import { EncryptDto } from './dto/encrypt.dto';
import { ValidateHashDto } from './dto/validate-hash.dto';

@ApiTags('Crypto')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('crypto')
export class CryptoController {
  constructor(private readonly cryptoService: CryptoService) {}

  @Post('validate-hash')
  @ApiOperation({ summary: 'Validar hash MD5 / SHA256' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: HASH_ALGOS },
        data: { type: 'string' },
        hash: { type: 'string' },
      },
      required: ['type', 'data', 'hash'],
    },
  })
  @UseInterceptors(AnyFilesInterceptor())
  @Permission(`${ModuleItemsMenu.CryptoModule}.${PermissionActionsMenu.CREATE}`)
  validateHash(@Body() dto: ValidateHashDto) {
    return this.cryptoService.validateHash(dto);
  }

  @Post('decrypt')
  @ApiOperation({ summary: 'Desencriptar payload cifrado (AES* / Laravel)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ALL_DECRYPT_ALGOS },
        payload: { type: 'string' },
        passphrase: { type: 'string' },
      },
      required: ['type', 'payload'],
    },
  })
  @UseInterceptors(AnyFilesInterceptor())
  @Permission(`${ModuleItemsMenu.CryptoModule}.${PermissionActionsMenu.CREATE}`)
  decrypt(@Body() dto: DecryptDto) {
    return this.cryptoService.decrypt(dto);
  }

  @Post('encrypt')
  @ApiOperation({ summary: 'Hash o cifrar según tipo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...HASH_ALGOS, ...CIPHER_ALGOS] },
        data: { type: 'string' },
        passphrase: { type: 'string' },
      },
      required: ['type', 'data'],
    },
  })
  @UseInterceptors(AnyFilesInterceptor())
  @Permission(`${ModuleItemsMenu.CryptoModule}.${PermissionActionsMenu.CREATE}`)
  encrypt(@Body() dto: EncryptDto) {
    return this.cryptoService.encrypt(dto);
  }

  @Post('hash')
  @ApiOperation({ summary: 'Generar hash MD5 / SHA256' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: HASH_ALGOS },
        data: { type: 'string' },
      },
      required: ['type', 'data'],
    },
  })
  @UseInterceptors(AnyFilesInterceptor())
  @Permission(`${ModuleItemsMenu.CryptoModule}.${PermissionActionsMenu.CREATE}`)
  hash(@Body() body: { type: HashAlgorithm; data: string }) {
    return this.cryptoService.hash(body.type, body.data);
  }
}
// ...existing code...