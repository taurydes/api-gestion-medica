import * as fs from 'fs';

/** Bytes needed to see every signature below (DICOM puts `DICM` at offset 128). */
export const SIGNATURE_BYTES = 132;

export type SniffedType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/bmp'
  | 'image/tiff'
  | 'application/dicom';

/** Content type read from the file's magic bytes, or null when none matches. */
export function detectFileType(buffer: Buffer): SniffedType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.toString('hex', 0, 8) === '89504e470d0a1a0a') return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.length >= 2 && buffer.toString('ascii', 0, 2) === 'BM') return 'image/bmp';
  if (buffer.length >= 4) {
    const head = buffer.toString('hex', 0, 4);
    if (head === '49492a00' || head === '4d4d002a') return 'image/tiff';
  }
  if (buffer.length >= SIGNATURE_BYTES && buffer.toString('ascii', 128, 132) === 'DICM') return 'application/dicom';
  return null;
}

/** Maps a declared MIME to the family `detectFileType` returns (`image/jpg` → jpeg, any dicom → application/dicom). */
export function canonicalMimeType(declared: string): string {
  if (declared === 'image/jpg') return 'image/jpeg';
  if (declared.includes('dicom')) return 'application/dicom';
  return declared;
}

/** First bytes of the upload, from memory or from multer's temp file. */
export function readSignature(file: { buffer?: Buffer; path?: string }): Buffer {
  if (file.buffer) return file.buffer.subarray(0, SIGNATURE_BYTES);
  if (!file.path) return Buffer.alloc(0);
  const fd = fs.openSync(file.path, 'r');
  try {
    const head = Buffer.alloc(SIGNATURE_BYTES);
    const read = fs.readSync(fd, head, 0, SIGNATURE_BYTES, 0);
    return head.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}
