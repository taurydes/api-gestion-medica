import { PermissionResult } from 'src/permission/permission.const';
import { AuthUser } from './interfaces/User';

export type UserSecurityPayload = {
  id: number;
  roleId?: number;
};

export interface JwtPayload {
  access_token: string;
  refresh_token: string;
  data?: Partial<AuthUser>;
  modules?: any;
}
