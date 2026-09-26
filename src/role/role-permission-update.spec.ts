import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { FakeRepo } from '../../test/in-memory-db';
import { UpdatePermissionDto } from 'src/permission/dto/update-permission.dto';
import { PermissionService } from 'src/permission/services/permission.service';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';
import { MenuService } from 'src/menu/menu.service';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const validate = (metatype: any, body: unknown) => pipe.transform(body, { type: 'body', metatype });

function fakeCache() {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (k: string) => store.get(k)),
    set: jest.fn(async (k: string, v: unknown) => void store.set(k, v)),
    del: jest.fn(async (k: string) => void store.delete(k)),
  } as any;
}

describe('PATCH /roles/:id con el cuerpo que envía el frontend (M-26)', () => {
  const rows = () => [
    { id: 'r-enf', name: 'enfermero', isActive: true, updatedAt: null },
    { id: 'r-med', name: 'medico', isActive: true, updatedAt: null },
  ];

  it('el DTO conserva isActive y descarta description (no hay columna)', async () => {
    const out = await validate(UpdateRoleDto, { name: 'enfermería', description: 'x', isActive: false });
    expect({ ...out }).toEqual({ name: 'enfermería', isActive: false });
  });

  it('persiste nombre e isActive', async () => {
    const table = rows();
    const service = new RoleService(new FakeRepo(table) as any, fakeCache());

    const updated = await service.update('r-enf', { name: 'enfermería', isActive: false });

    expect(updated).toMatchObject({ id: 'r-enf', name: 'enfermería', isActive: false });
    expect(table[0].updatedAt).toBeInstanceOf(Date);
  });

  it('no permite renombrar un rol del sistema, pero sí cambiar su estado sin tocar el nombre', async () => {
    const table = rows();
    const service = new RoleService(new FakeRepo(table) as any, fakeCache());

    await expect(service.update('r-med', { name: 'doctor' })).rejects.toThrow(BadRequestException);
    expect(table[1].name).toBe('medico');

    await expect(service.update('r-med', { name: 'medico', isActive: true })).resolves.toMatchObject({
      name: 'medico',
    });
  });
});

describe('PATCH /permissions/:id (M-26: catálogo fijo de acciones)', () => {
  const build = () => {
    const table: any[] = [
      { id: 'p-1', name: 'consultar', displayName: 'Consultar', isActive: true, deletedAt: null },
      { id: 'p-2', name: 'aprobar', displayName: 'Aprobar', isActive: true, deletedAt: null },
    ];
    const service = new PermissionService(
      new FakeRepo([]) as any,
      new FakeRepo([]) as any,
      new FakeRepo(table) as any,
      new FakeRepo([]) as any,
      new FakeRepo([]) as any,
      new FakeRepo([]) as any,
      fakeCache(),
    );
    return { table, service };
  };

  it('el DTO conserva displayName e isActive y descarta slug/description', async () => {
    const out = await validate(UpdatePermissionDto, {
      name: 'consultar',
      displayName: 'Ver',
      isActive: false,
      slug: 'consultar',
      description: 'x',
    });
    expect({ ...out }).toEqual({ name: 'consultar', displayName: 'Ver', isActive: false });
  });

  it('persiste displayName e isActive cuando el nombre no cambia', async () => {
    const { table, service } = build();

    await service.update('p-1', { name: 'consultar', displayName: 'Ver' });
    await service.update('p-2', { name: 'aprobar', isActive: false });

    expect(table[0]).toMatchObject({ name: 'consultar', displayName: 'Ver', isActive: true });
    expect(table[1]).toMatchObject({ name: 'aprobar', isActive: false });
  });

  it('las acciones del sistema no se pueden eliminar ni desactivar (409)', async () => {
    const { table, service } = build();

    await expect(service.remove('p-1')).rejects.toThrow(ConflictException);
    await expect(service.update('p-1', { isActive: false })).rejects.toThrow(ConflictException);
    expect(table[0]).toMatchObject({ isActive: true, deletedAt: null });

    await service.remove('p-2');
    expect(table[1].isActive).toBe(false);
  });

  it('rechaza renombrar la acción con 400 y no escribe', async () => {
    const { table, service } = build();

    await expect(service.update('p-1', { name: 'ver' })).rejects.toThrow(BadRequestException);
    expect(table[0].name).toBe('consultar');
  });
});

describe('Guardas de administración (fase 2)', () => {
  it('superusuario no se puede desactivar ni eliminar (400)', async () => {
    const table: any[] = [{ id: 'r-su', name: 'superusuario', isActive: true, updatedAt: null }];
    const repo = new FakeRepo(table) as any;
    repo.remove = jest.fn();
    const service = new RoleService(repo, fakeCache());

    await expect(service.update('r-su', { isActive: false })).rejects.toThrow(BadRequestException);
    await expect(service.remove('r-su')).rejects.toThrow(BadRequestException);
    expect(table[0].isActive).toBe(true);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('PATCH /menu/:id rechaza cambiar el slug y acepta el resto', async () => {
    const table: any[] = [{ id: 'm1', name: 'Pacientes', slug: 'patient', order: 40 }];
    const menus = new MenuService(new FakeRepo(table) as any, fakeCache(), {} as any, {} as any);

    await expect(menus.update('m1', { slug: 'patients' })).rejects.toThrow(BadRequestException);
    expect(table[0].slug).toBe('patient');

    await menus.update('m1', { slug: 'patient', name: 'Pacientes 2', order: 41 });
    expect(table[0]).toMatchObject({ slug: 'patient', name: 'Pacientes 2', order: 41 });
  });
});
