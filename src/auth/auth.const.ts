import { AuthUser } from './interfaces/User';

export type UserSecurityPayload = {
  id: number;
  roleId?: number;
  roleName: string;
};

export interface JwtPayload {
  access_token: string;
  refresh_token: string;
  data?: Partial<AuthUser>;
  modules?: any;
}

/** What the JWT carries: identifiers only, no email or person data (M-63). */
export interface JwtUserPayload {
  id: string;
  roleId: string | null;
  name: string | null;
}

export const toJwtUserPayload = (
  id: string,
  user: { roleId?: string | null; name?: string | null },
): JwtUserPayload => ({ id, roleId: user.roleId ?? null, name: user.name ?? null });
