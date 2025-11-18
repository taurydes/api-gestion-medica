// ...existing code...
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  createEncryptionAdapter,
  EncryptionType
} from 'src/common/crypto-adapter/encryption.adapter';
import { CIPHER_ALGOS, CipherAlgorithm, HASH_ALGOS, HashAlgorithm } from './crypto.const';
import { DecryptDto } from './dto/decrypt.dto';
import { EncryptDto } from './dto/encrypt.dto';
import { ValidateHashDto } from './dto/validate-hash.dto';

@Injectable()
export class CryptoService {
  private readonly enc = createEncryptionAdapter();

  validateHash(dto: ValidateHashDto) {
    const ok = this.enc.verifyHash(dto.type, dto.data, dto.hash);
    return { valid: ok, type: dto.type };
  }

  decrypt(dto: DecryptDto) {
    try {
      const plain = this.enc.safeDecrypt(dto.type as EncryptionType, dto.payload, dto.passphrase);
      return {
        ok: plain.ok,
        data: plain.ok && typeof plain.data === 'string'
          ? this.tryParse(plain.data)
          : plain.data ?? null,
        type: dto.type,
      };
    } catch {
      throw new InternalServerErrorException('Error desencriptando payload');
    }
  }

  encrypt(dto: EncryptDto) {
    if (HASH_ALGOS.includes(dto.type as HashAlgorithm)) {
      const h = this.enc.encrypt(dto.type, dto.data);
      return { hash: h.raw, type: dto.type };
    }
    if (CIPHER_ALGOS.includes(dto.type as CipherAlgorithm)) {
      const r = this.enc.encrypt(dto.type, dto.data, dto.passphrase);
      return { payload: r.raw, type: dto.type };
    }
    throw new BadRequestException('Tipo inválido');
  }

  hash(type: HashAlgorithm, data: string) {
    const h = this.enc.encrypt(type, data);
    return { hash: h.raw, type };
  }

  private tryParse(v: string) {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
}
// ...existing code...