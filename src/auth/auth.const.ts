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
