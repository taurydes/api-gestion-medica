import * as crypto from 'crypto';
import { AuthService } from './auth.service';

// Mirrors permissions-cipher.util.ts to read the encrypted `modules` payload.
function decrypt(payload: string) {
  const secret = process.env.PERMISSIONS_SECRET ?? 'gestion-medica-perms-secret-key!!';
  const [iv, data] = payload.split(':');
  const key = Buffer.from(secret.padEnd(32).slice(0, 32));
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8'));
}

const center = (id: string) => ({ id, name: `Centro ${id}`, address: null, isActive: true });

function build(doctorId: string | null, doctorCenters: any[], staffCenters: any[], options: { isAdmin?: boolean; firstLogin?: boolean } = {}) {
  const permissionService = {
    getUserPermissions: jest.fn().mockResolvedValue({ userId: 'u1', email: 'e', rules: [], role: { id: 'r', name: 'enfermero' }, permissions: [], menus: [] }),
  };
  const authContext = {
    getDoctorIdForUser: jest.fn().mockResolvedValue(doctorId),
    getMedicalCentersForDoctor: jest.fn().mockResolvedValue(doctorCenters),
    isAdmin: jest.fn().mockResolvedValue(options.isAdmin ?? false),
  };
  const userCentersRepo = { find: jest.fn().mockResolvedValue(staffCenters.map((mc) => ({ medicalCenter: mc }))) };
  return new AuthService(
    { findOne: jest.fn().mockResolvedValue({ id: 'u1', name: 'n', email: 'e', firstLogin: options.firstLogin ?? false }) } as any,
    { findOne: jest.fn().mockResolvedValue(null) } as any,
    {} as any,
    {} as any,
    permissionService as any,
    authContext as any,
    userCentersRepo as any,
  );
}

describe('GET /auth/me: centros del médico ∪ centros asignados al usuario (fase 2)', () => {
  it('personal no médico recibe sus centros asignados', async () => {
    const me = await build(null, [], [center('a')]).getUserWithPermissions('u1');
    expect(decrypt(me.modules).medicalCenters.map((c: any) => c.id)).toEqual(['a']);
    expect(me.doctorId).toBeNull();
  });

  it('médico con vínculo propio: unión sin duplicados', async () => {
    const me = await build('d1', [center('a'), center('b')], [center('b'), center('c')]).getUserWithPermissions('u1');
    expect(decrypt(me.modules).medicalCenters.map((c: any) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('GET /auth/me: isAdmin and mustChangePassword computed by the API (MJ-06, MJ-05)', () => {
  it('admin by permission → isAdmin true; a regular user → false', async () => {
    expect((await build(null, [], [], { isAdmin: true }).getUserWithPermissions('u1')).isAdmin).toBe(true);
    expect((await build('d1', [], [], { isAdmin: false }).getUserWithPermissions('u1')).isAdmin).toBe(false);
  });

  it('firstLogin (set by an admin reset) → mustChangePassword true', async () => {
    expect((await build(null, [], [], { firstLogin: true }).getUserWithPermissions('u1')).mustChangePassword).toBe(true);
    expect((await build(null, [], []).getUserWithPermissions('u1')).mustChangePassword).toBe(false);
  });
});
