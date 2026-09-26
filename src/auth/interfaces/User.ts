import { User } from "src/user/entities/user.entity";
import { UserSecurity } from "src/user/entities/user.system.entity";

export interface AuthUser {
  id: string;
  // role is not part of the JWT payload
  user: Omit<User, 'password' | 'role'> | Omit<UserSecurity, 'password' | 'role'>;
}
