import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
// 32-byte key from env or fallback (store in .env as PERMISSIONS_SECRET)
const SECRET = process.env.PERMISSIONS_SECRET ?? 'gestion-medica-perms-secret-key!!'; // must be exactly 32 chars

export function encryptModules(data: object): string {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(SECRET.padEnd(32).slice(0, 32));
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}
