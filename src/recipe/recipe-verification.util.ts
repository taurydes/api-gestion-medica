import { randomUUID } from 'crypto';

/** 32 hex chars (122 random bits), URL-safe; same shape as the migration backfill. */
export function newVerificationCode(): string {
  return randomUUID().replace(/-/g, '');
}

/** Codes are hex: anything else is rejected before touching the database. */
export const VERIFICATION_CODE_PATTERN = /^[0-9a-f]{16,64}$/;
