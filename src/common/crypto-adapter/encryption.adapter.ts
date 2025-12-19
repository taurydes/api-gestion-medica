import * as crypto from 'crypto';

const ENCRYPT_KEY = process.env.ENCRYPT_KEY || 'default_key';
const ITER = 150_000;
const SALT_LEN = 16;
const IV_LEN = 12;
const KEY_LEN = 32;

/**
 * @summary Tipos soportados de operaciones criptográficas:
 * - MD5 / SHA256: hashing no reversible
 * - AES_GCM: cifrado autenticado con scrypt (aes-256-gcm)
 * - AES_CBC_CRYPTOJS: formato compatible CryptoJS (aes-256-cbc + derivación md5 repetida)
 * - AES_GCM_PBKDF2: cifrado autenticado con PBKDF2 (iteraciones configurables)
 * - LARAVEL_AES_CBC: desencriptar payload estilo Laravel (base64 + aes-256-cbc)
 */
export enum EncryptionType {
  /**
   * @summary Hash MD5 (no reversible), md5 es un algoritmo de hash que produce un valor de 128 bits (16 bytes) a partir de una entrada de longitud variable.
   */
  MD5 = 'md5',
  /**
   * @summary Hash SHA256 (no reversible), SHA-256 es un algoritmo de hash criptográfico que produce un valor de 256 bits (32 bytes) a partir de una entrada de longitud variable.
   */
  SHA256 = 'sha256',
  /**
   * @summary Cifrado AES-256-GCM con clave derivada por scrypt. AES_GCM es un modo de cifrado autenticado que proporciona confidencialidad e integridad de los datos.
   */
  AES_GCM = 'aes-gcm',
  /**
   * @summary Cifrado AES-256-CBC compatible con CryptoJS (derivación md5 escalonada). AES_CBC_CRYPTOJS es un modo de cifrado que utiliza el algoritmo AES en modo CBC (Cipher Block Chaining).
   */
  AES_CBC_CRYPTOJS = 'aes-cbc-cryptojs',
  /**
   * @summary Cifrado AES-256-GCM con clave derivada por PBKDF2 (AEAD). AES_GCM_PBKDF2 es un modo de cifrado autenticado que utiliza PBKDF2 para derivar la clave de cifrado.
   */
  AES_GCM_PBKDF2 = 'aes-gcm-pbkdf2',
  /**
   * @summary Desencriptar payload estilo Laravel (base64 + aes-256-cbc). LARAVEL_AES_CBC es un modo de cifrado utilizado en el framework Laravel de PHP.
   */
  LARAVEL_AES_CBC = 'laravel-aes-cbc',
}

/**
 * @summary Resultado estándar de encrypt():
 * - raw: representación serializada principal que se almacena/transmite
 * - type: tipo de operación aplicada
 * - meta: datos auxiliares (iv, tag, etc.) según el algoritmo
 */
export interface EncryptResult {
  raw: string;
  type: EncryptionType;
  meta?: Record<string, any>;
}

/**
 * @summary Contrato base para adaptadores de cifrado / hashing.
 */
export abstract class EncryptionAdapter {
  abstract encrypt(type: EncryptionType, data: string | object, passphrase?: string,): EncryptResult;
  abstract decrypt(type: EncryptionType, payload: string, passphrase?: string,): string | object | null;
  abstract hash(type: EncryptionType, data: string): string;
  abstract verifyHash(type: EncryptionType, original: string | object, hash: string,): boolean;
  abstract safeDecrypt(type: EncryptionType, payload: string, passphrase?: string): { ok: boolean; data?: any };
}

/**
 * @summary Implementación por defecto que centraliza hashing y varios modos de cifrado AES.
 * Valida APP_KEY mínima y expone dispatch para operaciones.
 */
export class DefaultEncryptionAdapter extends EncryptionAdapter {
  /**
   * @summary Inicializa el adaptador validando la longitud mínima de la clave base.
   */
  constructor(private readonly defaultKey: string = ENCRYPT_KEY) {
    super();
    if (!this.defaultKey || this.defaultKey.length < 16) {
      throw new Error('APP_KEY inválido (mínimo 16 caracteres).');
    }
  }

  /**
   * @summary Aplica hashing no reversible (MD5 / SHA256).
   * @throws Error si se solicita hash para un tipo no soportado.
   */
  hash(type: EncryptionType, data: string): string {
    if (type === EncryptionType.MD5 || type === EncryptionType.SHA256) {
      return crypto.createHash(type).update(data).digest('hex');
    }
    throw new Error('Tipo de hash no soportado para hash()');
  }

  /**
   * @summary Dispatcher de cifrado / hashing. Retorna EncryptResult según tipo.
   * MD5 / SHA256 devuelven directamente el hash en raw.
   */
  encrypt(
    type: EncryptionType,
    data: string | object,
    passphrase?: string,
  ): EncryptResult {
    const key = passphrase || this.defaultKey;
    switch (type) {
      case EncryptionType.MD5:
      case EncryptionType.SHA256:
        return {
          raw: this.hash(
            type,
            typeof data === 'string' ? data : JSON.stringify(data),
          ),
          type,
        };
      case EncryptionType.AES_GCM:
        return this.encryptAesGcm(data, key);
      case EncryptionType.AES_CBC_CRYPTOJS:
        return this.encryptCryptoJsAes(data, key);
      case EncryptionType.AES_GCM_PBKDF2:
        return this.encryptAead(data, key);
      default:
        throw new Error('Tipo de encriptación no soportado');
    }
  }

  /**
   * @summary Dispatcher de desencriptado. Lanza error si se intenta revertir hash.
   */
  decrypt(
    type: EncryptionType,
    payload: string,
    passphrase?: string,
  ): string | object | null {
    const key = passphrase || this.defaultKey;
    switch (type) {
      case EncryptionType.MD5:
      case EncryptionType.SHA256:
        throw new Error('Los hashes no son reversibles');
      case EncryptionType.AES_GCM:
        return this.decryptAesGcm(payload, key);
      case EncryptionType.AES_CBC_CRYPTOJS:
        return this.decryptCryptoJsAes(payload, key);
      case EncryptionType.AES_GCM_PBKDF2:
        return this.decryptAead(payload, key);
      case EncryptionType.LARAVEL_AES_CBC:
        return this.decryptLaravel(payload);
      default:
        throw new Error('Tipo de desencriptación no soportado');
    }
  }

  /**
   * @summary Cifra usando AES-256-GCM con clave derivada por scrypt (sal fija).
   * @returns raw en formato iv:tag:cipher (base64 separado por :)
   */
  private encryptAesGcm(data: string | object, secret: string): EncryptResult {
    const plain = typeof data === 'string' ? data : JSON.stringify(data);
    const key = crypto.scryptSync(secret, 'static-salt-v1', 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const raw = `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
    return {
      raw,
      type: EncryptionType.AES_GCM,
      meta: { iv: iv.toString('base64'), tag: tag.toString('base64') },
    };
  }

  /**
   * @summary Descifra payload AES-256-GCM derivado con scrypt.
   * @throws Error si el formato raw es inválido.
   */
  private decryptAesGcm(payload: string, secret: string): string {
    const [ivB64, tagB64, cipherB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !cipherB64)
      throw new Error('Formato inválido AES-GCM');
    const key = crypto.scryptSync(secret, 'static-salt-v1', 32);
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(cipherB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }

  /**
   * @summary Cifra en formato compatible CryptoJS AES (aes-256-cbc + derivación md5 escalonada).
   * @returns JSON serializado con ct, iv, s.
   */
  private encryptCryptoJsAes(value: any, passphrase: string): EncryptResult {
    const salt = crypto.randomBytes(8);
    let salted = Buffer.alloc(0);
    let dx = Buffer.alloc(0);
    while (salted.length < 48) {
      dx = Buffer.from(
        crypto
        .createHash('md5')
        .update(Buffer.concat([dx, Buffer.from(passphrase), salt]))
        .digest(),
      );
      salted = Buffer.from(Buffer.concat([salted, dx]));
    }
    const key = salted.subarray(0, 32);
    const iv = salted.subarray(32, 48);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    const json = JSON.stringify({
      ct: encrypted.toString('base64'),
      iv: iv.toString('hex'),
      s: salt.toString('hex'),
    });
    return { raw: json, type: EncryptionType.AES_CBC_CRYPTOJS };
  }

  /**
   * @summary Desencripta formato CryptoJS AES (retorna objeto o null si falla).
   * Ignora payloads que son números de 16 o 20 dígitos (casos especiales).
   */
  private decryptCryptoJsAes(
    jsonString: string,
    passphrase: string,
  ): any | null {
    if (/^\d{16}$/.test(jsonString) || /^\d{20}$/.test(jsonString))
      return jsonString;
    try {
      const jsondata = JSON.parse(jsonString);
      const salt = Buffer.from(jsondata.s, 'hex');
      const iv = Buffer.from(jsondata.iv, 'hex');
      const ct = Buffer.from(jsondata.ct, 'base64');
      const concated = Buffer.concat([Buffer.from(passphrase), salt]);
      const md5: Buffer[] = [];
      md5[0] = crypto.createHash('md5').update(concated).digest();
      let result = Buffer.from(md5[0]);
      for (let i = 1; i < 3; i++) {
        md5[i] = crypto
          .createHash('md5')
          .update(Buffer.concat([md5[i - 1], concated]))
          .digest();
        result = Buffer.concat([result, md5[i]]);
      }
      const key = result.subarray(0, 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      const decrypted = Buffer.concat([
        decipher.update(ct),
        decipher.final(),
      ]).toString();
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }

  /**
   * @summary Cifra usando AES-256-GCM con clave derivada PBKDF2 (AEAD).
   * @returns JSON con salt, iv, ct, tag, iter.
   */
  private encryptAead(plain: unknown, passphrase: string): EncryptResult {
    const salt = crypto.randomBytes(SALT_LEN);
    const iv = crypto.randomBytes(IV_LEN);
    const key = crypto.pbkdf2Sync(passphrase, salt, ITER, KEY_LEN, 'sha512');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.from(JSON.stringify(plain));
    const ct = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = JSON.stringify({
      v: 1,
      s: salt.toString('base64'),
      iv: iv.toString('base64'),
      ct: ct.toString('base64'),
      tag: tag.toString('base64'),
      iter: ITER,
    });
    return { raw: payload, type: EncryptionType.AES_GCM_PBKDF2 };
  }

  /**
   * @summary Desencripta payload AES-256-GCM PBKDF2 (AEAD).
   */
  private decryptAead(payload: string, passphrase: string): any {
    const obj = JSON.parse(payload);
    const salt = Buffer.from(obj.s, 'base64');
    const iv = Buffer.from(obj.iv, 'base64');
    const ct = Buffer.from(obj.ct, 'base64');
    const tag = Buffer.from(obj.tag, 'base64');
    const key = crypto.pbkdf2Sync(
      passphrase,
      salt,
      obj.iter,
      KEY_LEN,
      'sha512',
    );
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  }

  /**
   * @summary Desencripta payload estilo Laravel (base64 JSON -> aes-256-cbc).
   * Retorna string plano o null si falla.
   */
  decryptLaravel(encrypted: string): string | null {
    try {
      const appKey = process.env.APP_KEY?.replace('base64:', '') || '';
      const key = Buffer.from(appKey, 'base64');
      const payload = JSON.parse(
        Buffer.from(encrypted, 'base64').toString('utf8'),
      );
      const iv = Buffer.from(payload.iv, 'base64');
      const value = Buffer.from(payload.value, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(value);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8').replace(/^\s*"(.*)"\s*$/, '$1');
    } catch {
      return null;
    }
  }

  /**
   * @summary Verifica hash (MD5 / SHA256) comparando valor recalculado.
   */
  verifyHash(
    type: EncryptionType,
    original: string | object,
    hash: string,
  ): boolean {
    if (type !== EncryptionType.MD5 && type !== EncryptionType.SHA256) {
      throw new Error('verifyHash solo soporta MD5 / SHA256');
    }
    const base =
      typeof original === 'string' ? original : JSON.stringify(original);
    return this.hash(type, base) === hash;
  }

  /**
   * @summary Intenta descifrar AES-GCM / AES-GCM-PBKDF2. Devuelve { ok, data } o { ok:false } si integridad falla.
   */
  safeDecrypt(
    type: EncryptionType,
    payload: string,
    passphrase?: string,
  ): { ok: boolean; data?: any } {
    try {
      const plain = this.decrypt(type, payload, passphrase);
      return { ok: true, data: plain };
    } catch {
      return { ok: false };
    }
  }
}

/**
 * @summary Crea instancia del adaptador principal usando APP_KEY global.
 */
export function createEncryptionAdapter(): EncryptionAdapter {
  return new DefaultEncryptionAdapter(ENCRYPT_KEY);
}

// Ejemplos:
// const enc = createEncryptionAdapter();
// const h = enc.encrypt(EncryptionType.SHA256, 'texto');
// const g = enc.encrypt(EncryptionType.AES_GCM, { id: 1 });
// const obj = enc.decrypt(EncryptionType.AES_GCM, g.raw);
