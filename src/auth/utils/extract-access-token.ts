import { Request } from 'express';

/** Access token from the `Authorization: Bearer` header, falling back to the `access_token` cookie. */
export function extractAccessToken(request: Request): string | null {
  const authHeader = request.headers.authorization;
  const bearer = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;
  if (bearer) return bearer;
  const rawCookie = request.headers.cookie;
  if (!rawCookie) return null;
  const cookies = Object.fromEntries(
    rawCookie.split(';').map((c) => {
      const [key, ...v] = c.trim().split('=');
      return [key, safeDecode(v.join('='))];
    }),
  );
  return cookies['access_token'] || null;
}

// A malformed %-sequence must not turn into a 500; the raw value then just fails verification.
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
