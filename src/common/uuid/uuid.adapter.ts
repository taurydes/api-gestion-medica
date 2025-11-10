import * as crypto from 'crypto';

/**
 * Interfaz base para adaptadores de UUID.
 */
export abstract class UuidAdapter {
  abstract create(): string;
}

/**
 * Implementación nativa usando crypto para UUID v4.
 */
export class NativeUuidAdapter extends UuidAdapter {
  create(): string {
    // Genera un UUID v4 usando el módulo nativo crypto
    // RFC4122 versión 4
    const bytes = crypto.randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC4122

    const hex = bytes.toString('hex');
    return (
      hex.substring(0, 8) +
      '-' +
      hex.substring(8, 12) +
      '-' +
      hex.substring(12, 16) +
      '-' +
      hex.substring(16, 20) +
      '-' +
      hex.substring(20, 32)
    );
  }
}

// Ejemplo de uso:
// const uuidAdapter = new NativeUuidAdapter();
// const uuid = uuidAdapter.v4();
