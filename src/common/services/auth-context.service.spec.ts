import { AuthContextService } from './auth-context.service';
import { UserAccessService } from './user-access.service';

function roleNamed(name: string, slugs: string[]) {
  return {
    id: 'r',
    name,
    isActive: true,
    deletedAt: null,
    permissionMenus: slugs.map((s) => ({
      isActive: true,
      menu: { slug: s.split('.')[0] },
      permission: { name: s.split('.')[1], isActive: true },
    })),
  };
}

function build(role: any, doctor: any = { id: 'doc-1' }) {
  const user = { id: 'u1', status: true, deletedAt: null, role, commonPerson: { id: 'cp1' } };
  const userRepo = { findOne: jest.fn().mockResolvedValue(user) };
  const secRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const doctorRepo = { findOne: jest.fn().mockResolvedValue(doctor) };
  const access = new UserAccessService(secRepo as any, userRepo as any);
  return new AuthContextService(userRepo as any, doctorRepo as any, access);
}

describe('AuthContextService — admin por permiso, no por nombre de rol (M-11)', () => {
  it('un rol llamado "Administrativo" sin security.consultar no es admin', async () => {
    const ctx = build(roleNamed('Administrativo', ['patient.consultar']));
    await expect(ctx.isAdmin('u1')).resolves.toBe(false);
    await expect(ctx.getScopedDoctorId('u1')).resolves.toBe('doc-1');
  });

  it('un rol con security.consultar es admin aunque tenga perfil de doctor', async () => {
    const ctx = build(roleNamed('superusuario', ['security.consultar']));
    await expect(ctx.isAdmin('u1')).resolves.toBe(true);
    await expect(ctx.getScopedDoctorId('u1')).resolves.toBeNull();
  });
});
