export enum RoleEnum {
  ADMIN = 'superusuario',
  USER = 'usuario',
  DOCTOR = 'medico',
}

/** Roles the code resolves by name (default doctor role, admin): renaming them breaks those lookups. */
export const SYSTEM_ROLE_NAMES: readonly string[] = [RoleEnum.ADMIN, RoleEnum.DOCTOR];
