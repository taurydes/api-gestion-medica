import { User } from "src/user/entities/user.entity";
import { UserSecurity } from "src/user/entities/user.system.entity";

export interface AuthUser {
  id: number;
  data: Omit<User, 'password'> |  Omit<UserSecurity, 'password'>;
}
