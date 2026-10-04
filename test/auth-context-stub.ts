import { AuthContextService } from 'src/common/services/auth-context.service';

/** Real AuthContextService over stubbed repos, so specs exercise the shared admin-exemption rule. */
export function authContextFor(options: { isAdmin: boolean; doctorId: string | null }) {
  const userRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'u1', commonPerson: { id: 'cp1' } }),
  };
  const doctorRepo = {
    findOne: jest.fn().mockResolvedValue(options.doctorId ? { id: options.doctorId } : null),
  };
  const access = { hasPermission: jest.fn().mockResolvedValue(options.isAdmin) };
  return new AuthContextService(userRepo as any, doctorRepo as any, access as any);
}

export interface StubUser {
  isAdmin: boolean;
  doctorId: string | null;
}

/** Same real service, resolving each userId to its own role and doctor profile. */
export function authContextForUsers(users: Record<string, StubUser>) {
  const userRepo = {
    findOne: jest.fn(async ({ where }: any) =>
      users[where.id] ? { id: where.id, commonPerson: { id: `cp-${where.id}` } } : null,
    ),
  };
  const doctorRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      const userId = String(where.commonPersonId ?? '').replace(/^cp-/, '');
      const doctorId = users[userId]?.doctorId;
      return doctorId ? { id: doctorId } : null;
    }),
  };
  const access = {
    hasPermission: jest.fn(async (userId: string) => !!users[userId]?.isAdmin),
  };
  return new AuthContextService(userRepo as any, doctorRepo as any, access as any);
}

/** Doctor A, doctor B and an admin: the three actors every scope rule is tested with. */
export const SCOPE_USERS: Record<string, StubUser> = {
  'user-a': { isAdmin: false, doctorId: 'doc-a' },
  'user-b': { isAdmin: false, doctorId: 'doc-b' },
  'user-admin': { isAdmin: true, doctorId: null },
};
