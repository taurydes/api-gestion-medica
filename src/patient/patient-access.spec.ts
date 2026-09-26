import { ForbiddenException } from '@nestjs/common';
import { PatientService } from './patient.service';

function build(options: { isDoctor: boolean; hasAppointment: boolean }) {
  const patient = { id: 'p1', commonPersonId: null };
  const patientRepo = {
    findOne: jest.fn().mockResolvedValue(patient),
    query: jest.fn().mockResolvedValue(options.hasAppointment ? [{ '?column?': 1 }] : []),
  };
  const userRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'u1', commonPerson: { id: 'cp1' } }),
  };
  const doctorRepo = {
    findOne: jest.fn().mockResolvedValue(options.isDoctor ? { id: 'doc-A' } : null),
  };
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
  const service = new PatientService(
    patientRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    userRepo as any,
    doctorRepo as any,
    {} as any,
    {} as any,
    cache as any,
    {} as any,
  );
  return { service, patientRepo };
}

describe('PatientService.findOne — filtro por médico (M-11)', () => {
  it('médico sin citas con el paciente → 403', async () => {
    const { service } = build({ isDoctor: true, hasAppointment: false });
    await expect(service.findOne('p1', { id: 'u1' })).rejects.toThrow(ForbiddenException);
  });

  it('médico con cita con el paciente → lo ve', async () => {
    const { service, patientRepo } = build({ isDoctor: true, hasAppointment: true });
    await expect(service.findOne('p1', { id: 'u1' })).resolves.toMatchObject({ id: 'p1' });
    expect(patientRepo.query).toHaveBeenCalledWith(expect.any(String), ['p1', 'doc-A']);
  });

  it('usuario que no es médico → sin filtro (igual que findAll)', async () => {
    const { service, patientRepo } = build({ isDoctor: false, hasAppointment: false });
    await expect(service.findOne('p1', { id: 'u1' })).resolves.toMatchObject({ id: 'p1' });
    expect(patientRepo.query).not.toHaveBeenCalled();
  });
});
