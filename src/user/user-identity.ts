import { Transform } from 'class-transformer';

export const USER_IDENTITY_CONFLICT =
  'El correo electrónico o nombre de usuario ya está en uso.';

/** Canonical form of a username or email (trimmed, lowercased): what is stored, compared and indexed. */
export const normalizeIdentity = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

/** Normalizes `name` and `email` in place when they are strings; other fields are left untouched. */
export function normalizeIdentityFields<T extends object>(data: T): T {
  const fields = data as { name?: unknown; email?: unknown };
  if (typeof fields.name === 'string')
    fields.name = normalizeIdentity(fields.name);
  if (typeof fields.email === 'string')
    fields.email = normalizeIdentity(fields.email);
  return data;
}

/** DTO decorator: normalizes before validation, so " Juan@X.com " passes @IsEmail as "juan@x.com". */
export const NormalizeIdentity = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? normalizeIdentity(value) : value,
  );

/** The name/email of a patch that differ from the stored row: only those need a uniqueness check. */
export function changedIdentity(
  patch: { name?: unknown; email?: unknown },
  current: { name?: string; email?: string },
): { name?: string; email?: string } {
  const changed: { name?: string; email?: string } = {};
  if (typeof patch.name === 'string' && patch.name !== current.name)
    changed.name = patch.name;
  if (typeof patch.email === 'string' && patch.email !== current.email)
    changed.email = patch.email;
  return changed;
}
