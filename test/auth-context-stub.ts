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
