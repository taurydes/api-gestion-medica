import { ConfigService } from '@nestjs/config';

const ABSOLUTE_URL = /^https?:\/\//i;

/** Public base URL for file links: a full http(s) URL_HOST is used as-is (no port); a bare host keeps `http://host:PORT`. */
export function buildPublicBaseUrl(
  urlHost?: string,
  port?: string | number,
): string {
  const host = (urlHost ?? '').trim() || 'localhost';
  if (ABSOLUTE_URL.test(host)) return host.replace(/\/+$/, '');
  return `http://${host}:${port || '8008'}`;
}

/** Reads URL_HOST and PORT from config and resolves the public base URL. */
export function resolvePublicBaseUrl(configService: ConfigService): string {
  return buildPublicBaseUrl(
    configService.get<string>('URL_HOST'),
    configService.get<string>('PORT'),
  );
}
