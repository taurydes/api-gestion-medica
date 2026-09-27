import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FakeRepo } from '../../test/in-memory-db';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { findUserCenters, replaceUserCenters } from './user-centers';
import { UserService } from './user.service';

const C1 = 'c1000000-0000-4000-8000-000000000001';
const C2 = 'c1000000-0000-4000-8000-000000000002';
const C3 = 'c1000000-0000-4000-8000-000000000003';

function setup(links: any[] = []) {
  const centers = new FakeRepo([
    { id: C1, name: 'Centro 1', deletedAt: null },
    { id: C2, name: 'Centro 2', deletedAt: null },
    { id: C3, name: 'Centro borrado', deletedAt: new Date() },
  ]);
  const linkRepo = new FakeRepo(links);
  const manager = { getRepository: (entity: unknown) => (entity === MedicalCenter ? centers : linkRepo) } as any;
  return { manager, links };
}

describe('Centros de personal no médico (users_medical_centers)', () => {
  it('reemplaza el conjunto: borra lógicamente los que salen y crea los nuevos', async () => {
    const { manager, links } = setup([{ id: 'l1', userId: 'u1', medicalCenterId: C1, deletedAt: null }]);

    await replaceUserCenters(manager, 'u1', [C2, C2], 'admin');

    expect(links.find((l) => l.id === 'l1')!.deletedAt).toBeInstanceOf(Date);
    const live = links.filter((l) => l.deletedAt == null);
    expect(live).toEqual([expect.objectContaining({ userId: 'u1', medicalCenterId: C2, createdBy: 'admin' })]);
  });

  it('un centro que se mantiene no se duplica; [] quita todos', async () => {
    const { manager, links } = setup([{ id: 'l1', userId: 'u1', medicalCenterId: C1, deletedAt: null }]);

    await replaceUserCenters(manager, 'u1', [C1], null);
    expect(links.filter((l) => l.deletedAt == null)).toHaveLength(1);

    await replaceUserCenters(manager, 'u1', [], null);
    expect(links.filter((l) => l.deletedAt == null)).toHaveLength(0);
  });

  it('centro inexistente o borrado → 400 sin escribir', async () => {
    const { manager, links } = setup();

    await expect(replaceUserCenters(manager, 'u1', [C1, C3], null)).rejects.toThrow(BadRequestException);
    expect(links).toHaveLength(0);
  });

  it('findUserCenters pide solo vínculos y centros vivos', async () => {
    const repo = { find: jest.fn().mockResolvedValue([{ medicalCenter: { id: C1, name: 'Centro 1' } }]) };

    await expect(findUserCenters(repo as any, 'u1')).resolves.toEqual([{ id: C1, name: 'Centro 1' }]);
    const where = repo.find.mock.calls[0][0].where;
    expect(where.userId).toBe('u1');
    expect(where.deletedAt).toBeDefined();
    expect(where.medicalCenter.deletedAt).toBeDefined();
  });

  it('PATCH/POST /users con medicalCenterIds sin role.actualizar → 403', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue({ id: 'u1', roleId: 'r', status: true, commonPerson: null }) };
    const service = new UserService(repo as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    await expect(service.update('u1', { medicalCenterIds: [C1] }, ['user.actualizar'])).rejects.toThrow(ForbiddenException);
    await expect(service.create({ medicalCenterIds: [C1] } as any, ['user.crear'])).rejects.toThrow(ForbiddenException);
  });
});
