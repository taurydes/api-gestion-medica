import { EncryptionType } from 'src/common/crypto-adapter/encryption.adapter';

export const HASH_ALGOS = [EncryptionType.MD5, EncryptionType.SHA256];
export type HashAlgorithm = (typeof HASH_ALGOS)[number];

// Algoritmos de cifrado (encrypt + decrypt)
export const CIPHER_ALGOS = [
  EncryptionType.AES_GCM,
  EncryptionType.AES_GCM_PBKDF2,
  EncryptionType.AES_CBC_CRYPTOJS,
];
export type CipherAlgorithm = (typeof CIPHER_ALGOS)[number];

// Solo decrypt adicional
export const DECRYPT_ONLY_EXTRA = [EncryptionType.LARAVEL_AES_CBC];
export const ALL_DECRYPT_ALGOS = [...CIPHER_ALGOS, ...DECRYPT_ONLY_EXTRA];