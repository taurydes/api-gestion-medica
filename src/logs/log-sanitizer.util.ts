/** Valor que reemplaza a los datos sensibles antes de persistir un log. */
export const MASK = '******';

/** Headers que nunca se guardan: credenciales y tokens de sesión. */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'token',
  'x-access-token',
  'x-refresh-token',
  'x-api-key',
]);

// Claves de body/query/params que se enmascaran a cualquier profundidad (password, currentPassword, refreshToken...).
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key/i;

export function sanitizeHeaders(
  headers: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (!headers || typeof headers !== 'object') return headers;
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key]) => !SENSITIVE_HEADERS.has(key.toLowerCase()))
      .map(([key, value]) =>
        key.toLowerCase() === 'referer' && typeof value === 'string'
          ? [key, sanitizeRoute(value)]
          : [key, value],
      ),
  );
}

export function maskSensitive<T>(value: T, depth = 0): T {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item: unknown) => maskSensitive(item, depth + 1)) as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY.test(key)
      ? MASK
      : maskSensitive(item, depth + 1);
  }
  return result as T;
}

/** Enmascara los parámetros sensibles de la query string de una ruta (`?token=...`). */
export function sanitizeRoute(route: string | undefined): string | undefined {
  if (!route || !route.includes('?')) return route;
  const [pathPart, query] = route.split('?', 2);
  const params = query.split('&').map((pair) => {
    const [key] = pair.split('=', 1);
    return SENSITIVE_KEY.test(decodeURIComponentSafe(key))
      ? `${key}=${MASK}`
      : pair;
  });
  return `${pathPart}?${params.join('&')}`;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
