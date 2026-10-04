import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { FakeRepo } from '../../test/in-memory-db';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { DoctorScheduleService } from './doctor-schedule.service';
import { CreateDoctorScheduleDto, UpdateDoctorScheduleBlockDto } from './dto/doctor-schedule.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { DoctorsService } from './doctors.service';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const validate = (metatype: any, body: unknown) => pipe.transform(body, { type: 'body', metatype });

const person = { firstName: 'Ana', lastName: 'Pérez', letter: 'V', documentNumber: '12345678' };

describe('commonPerson.phoneNumber (M-32)', () => {
  it('PATCH /doctors/:id conserva commonPerson.phoneNumber', async () => {
    const out = await validate(UpdateDoctorDto, { commonPerson: { ...person, phoneNumber: '04141234567' } });
    expect(out.commonPerson.phoneNumber).toBe('04141234567');
  });

  it('acepta los formatos que ya hay en la base y "" como borrado', async () => {
    for (const phone of ['04141234567', '+584141234567', '12345678', '0414-123 4567']) {
      const out = await validate(UpdateDoctorDto, { commonPerson: { ...person, phoneNumber: phone } });
      expect(out.commonPerson.phoneNumber).toBe(phone);
    }
    const cleared = await validate(UpdateDoctorDto, { commonPerson: { ...person, phoneNumber: '' } });
    expect(cleared.commonPerson.phoneNumber).toBeNull();
  });

  it('rechaza letras y valores de más de 20 caracteres', async () => {
    for (const phone of ['abc1234567', '1'.repeat(21), '123']) {
      await expect(
        validate(UpdateDoctorDto, { commonPerson: { ...person, phoneNumber: phone } }),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('POST /users valida commonPerson anidado y descarta campos ajenos al DTO', async () => {
    const body = { name: 'ana', email: 'ana@example.com', password: 'secreto1', roleId: '69cf7b3a-864c-44d7-8541-1ab57d34f49b', commonPerson: { ...person, phoneNumber: '04141234567', deletedAt: '2020-01-01', id: 'x' } };
    const out = await validate(CreateUserDto, body);
    expect(out.commonPerson).toEqual({ ...person, phoneNumber: '04141234567' });

    await expect(
      validate(CreateUserDto, { ...body, commonPerson: { ...person, firstName: 'x'.repeat(31) } }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('PATCH /doctors/:id con commonPerson parcial (H-03)', () => {
  function service(current: Record<string, unknown>) {
    const doctor = { id: 'd1', commonPerson: { id: 'p1', ...current } };
    const personRepo = { save: jest.fn(async (x) => x), findOne: jest.fn().mockResolvedValue(null) };
    const doctorRepo = { findOne: jest.fn().mockResolvedValue(doctor), save: jest.fn(async (x) => x) };
    const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };
    const svc = new DoctorsService(
      doctorRepo as any, personRepo as any, {} as any, {} as any, {} as any, {} as any,
      cache as any, {} as any, {} as any, {} as any,
    );
    return { svc, personRepo };
  }

  it('solo phoneNumber pasa la validación y cambia solo el teléfono', async () => {
    const dto = await validate(UpdateDoctorDto, { commonPerson: { phoneNumber: '04245556677' } });
    const { svc, personRepo } = service(person);

    const updated = await svc.update('d1', dto);

    expect(personRepo.save).toHaveBeenCalledWith({ id: 'p1', ...person, phoneNumber: '04245556677' });
    expect(updated.commonPerson).toMatchObject({ firstName: 'Ana', lastName: 'Pérez' });
  });

  it('sigue validando los campos enviados: nombre null, largo o teléfono inválido → 400', async () => {
    for (const commonPerson of [
      { firstName: null },
      { lastName: null },
      { firstName: 'x'.repeat(31) },
      { phoneNumber: 'abc' },
    ]) {
      await expect(validate(UpdateDoctorDto, { commonPerson })).rejects.toThrow(BadRequestException);
    }
  });
});

describe('Horarios del médico (M-37)', () => {
  it('acepta HH:mm y HH:mm:ss y normaliza a HH:mm:ss', async () => {
    const out = await validate(UpdateDoctorScheduleBlockDto, { startTime: '08:00:00', endTime: '12:30' });
    expect(out).toMatchObject({ startTime: '08:00:00', endTime: '12:30:00' });

    const create = await validate(CreateDoctorScheduleDto, {
      doctorId: '69cf7b3a-864c-44d7-8541-1ab57d34f49b',
      medicalCenterId: 'fd6a2bac-c8fe-4e91-9839-cd5a06fef078',
      blocks: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00:00' }],
    });
    expect(create.blocks[0]).toMatchObject({ startTime: '08:00:00', endTime: '12:00:00' });
  });

  it('rechaza horas fuera de rango o con otro formato', async () => {
    for (const startTime of ['24:00', '8:00', '08:60', '08:00:00.000', 'mañana']) {
      await expect(validate(UpdateDoctorScheduleBlockDto, { startTime })).rejects.toThrow(BadRequestException);
    }
  });

  it('reenviar el horario leído (08:00:00) actualiza el bloque; inicio igual a fin sigue siendo 400', async () => {
    const rows = [{ id: 'b1', doctorId: 'd1', medicalCenterId: 'c1', startTime: '08:00:00', endTime: '12:00:00', deletedAt: null }];
    const cache = { del: jest.fn() } as any;
    const service = new DoctorScheduleService(new FakeRepo(rows) as any, {} as any, {} as any, cache, {} as any);

    const dto = await validate(UpdateDoctorScheduleBlockDto, { startTime: '08:00:00', endTime: '13:00' });
    await service.updateBlock('b1', dto);
    expect(rows[0]).toMatchObject({ startTime: '08:00:00', endTime: '13:00:00' });

    // "12:00" vs "12:00:00" compared as strings used to pass as start < end.
    const equal = await validate(UpdateDoctorScheduleBlockDto, { startTime: '13:00' });
    await expect(service.updateBlock('b1', equal)).rejects.toThrow(BadRequestException);
  });
});
