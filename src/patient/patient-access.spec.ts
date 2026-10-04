import { ForbiddenException } from '@nestjs/common';
import { PatientService } from './patient.service';
import { authContextFor } from '../../test/auth-context-stub';

function build(options: { isAdmin?: boolean; isDoctor: boolean; hasAppointment: boolean }) {
  const patient = { id: 'p1', commonPersonId: null };
  const patientRepo = {
    findOne: jest.fn().mockResolvedValue(patient),
    query: jest.fn().mockResolvedValue(options.hasAppointment ? [{ '?column?': 1 }] : []),
  };
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
  const service = new PatientService(
    patientRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    cache as any,
    {} as any,
    authContextFor({
      isAdmin: options.isAdmin ?? false,
      doctorId: options.isDoctor ? 'doc-A' : null,
    }),
  );
  return { service, patientRepo, cache };
}

describe('PatientService.findOne — filtro por médico (M-11)', () => {
  it('médico sin citas con el paciente → 403', async () => {
    const { service } = build({ isDoctor: true, hasAppointment: false });
    await expect(service.findOne('p1', { id: 'u1' })).rejects.toThrow(ForbiddenException);
  });

  it('médico con cita con el paciente → lo ve', async () => {
    const { service, patientRepo } = build({ isDoctor: true, hasAppointment: true });
    await expect(service.findOne('p1', { id: 'u1' })).resolves.toMatchObject({ id: 'p1' });
    expect(patientRepo.query).toHaveBeenCalledWith(expect.any(String), ['p1', 'u1', 'doc-A']);
  });

  it('personal no médico sin centros ni pacientes propios → 403 (MJ-02)', async () => {
    const { service, patientRepo } = build({ isDoctor: false, hasAppointment: false });
    await expect(service.findOne('p1', { id: 'u1' })).rejects.toThrow(ForbiddenException);
    expect(patientRepo.query).toHaveBeenCalledWith(expect.any(String), ['p1', 'u1']);
  });

  it('admin con registro de doctor → acceso global, sin filtro', async () => {
    const { service, patientRepo } = build({ isAdmin: true, isDoctor: true, hasAppointment: false });
    await expect(service.findOne('p1', { id: 'u1' })).resolves.toMatchObject({ id: 'p1' });
    expect(patientRepo.query).not.toHaveBeenCalled();
  });
});

describe('PatientService.findAll — alcance por médico (M-11)', () => {
  const query = { page: 1, limit: 10 } as any;

  it('admin con registro de doctor → consulta global (sin alcance)', async () => {
    const { service, cache } = build({ isAdmin: true, isDoctor: true, hasAppointment: false });
    cache.get.mockResolvedValue({ data: [] });
    await service.findAll(query, { id: 'u1' });
    expect(cache.get).toHaveBeenCalledWith(expect.stringContaining('"scope":null'));
  });

  it('médico común → consulta restringida a su doctorId', async () => {
    const { service, cache } = build({ isDoctor: true, hasAppointment: false });
    cache.get.mockResolvedValue({ data: [] });
    await service.findAll(query, { id: 'u1' });
    expect(cache.get).toHaveBeenCalledWith(expect.stringContaining('"doctorId":"doc-A"'));
  });
});
