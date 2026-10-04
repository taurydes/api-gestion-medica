import { BadRequestException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { InMemoryDb } from '../../test/in-memory-db';
import { MedicalAppointmentsService } from './medical-appointments.service';
import { authContextFor, authContextForUsers, SCOPE_USERS } from '../../test/auth-context-stub';
import {
  AppointmentStatus,
  MedicalAppointment,
} from './entities/medical-appointment.entity';
import { MedicalHistoryService } from 'src/medical-history/medical-history.service';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { RecipeService } from 'src/recipe/recipe.service';
import { Recipe } from 'src/recipe/entities/recipe.entity';
import { RecipeItem } from 'src/recipe/entities/recipe-item.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { Medication } from 'src/parameters/entities/medication.entity';
import { CompleteConsultationDto } from './dto/complete-consultation.dto';

const MISSING_MEDICATION = '5b0f6a55-4a0e-4c1a-9f5e-000000000000';

function setup(authContext: any = authContextFor({ isAdmin: true, doctorId: null })) {
  const db = new InMemoryDb()
    .table(MedicalAppointment, [
      { id: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', status: AppointmentStatus.IN_CONSULTATION, deletedAt: null },
    ])
    .table(Patient, [{ id: 'pat-1', deletedAt: null }])
    .table(Doctor, [{ id: 'doc-1', deletedAt: null }, { id: 'doc-a', deletedAt: null }])
    .table(MedicalCenter)
    .table(Specialty)
    .table(Medication, [{ id: 'med-1', deletedAt: null }])
    // medical_appointment_id is unique in the real schema (UQ_bae767a5…)
    .table(MedicalHistory, [], { unique: ['medicalAppointmentId'] })
    .table(Recipe)
    .table(RecipeItem);

  const cache = { get: jest.fn().mockResolvedValue([]), set: jest.fn(), del: jest.fn() };
  const history = new MedicalHistoryService(
    db.repo(MedicalHistory),
    db.repo(Patient),
    db.repo(Doctor),
    db.repo(MedicalCenter),
    db.repo(Specialty),
    {} as any,
    cache as any,
    {} as any,
    {} as any,
  );
  const recipe = new RecipeService(
    db.repo(Recipe),
    db.repo(RecipeItem),
    db.repo(Patient),
    db.repo(Doctor),
    db.repo(MedicalHistory),
    cache as any,
    {} as any,
    {} as any,
    db.dataSource,
    {} as any,
  );
  const service = new MedicalAppointmentsService(
    db.repo(MedicalAppointment),
    db.repo(Patient),
    {} as any,
    db.repo(Doctor),
    db.repo(Specialty),
    db.repo(MedicalCenter),
    {} as any,
    {} as any,
    {} as any,
    db.repo(Medication),
    cache as any,
    {} as any,
    history,
    recipe,
    {} as any,
    {} as any,
    authContext,
    db.dataSource,
  );
  // The final reload joins many relations; it is not what these tests are about.
  jest
    .spyOn(service as any, 'loadFullAppointment')
    .mockImplementation(async (id: string) => db.rows(MedicalAppointment).find((a) => a.id === id));

  return { service, db };
}

function dto(medicationId = 'med-1'): CompleteConsultationDto {
  return {
    medicalHistory: { consultationDate: '2026-09-25', reasonForVisit: 'control' },
    recipe: {
      items: [{ medicationId, medicationName: 'Ibuprofeno', dosage: '400mg', frequency: '8h', quantity: 10 }],
    },
  } as CompleteConsultationDto;
}

const status = (db: InMemoryDb) => db.rows(MedicalAppointment)[0].status;

describe('MedicalAppointmentsService.finishConsultation — atomic close (M-14)', () => {
  it('a medicationId that does not exist → 404 and nothing is written', async () => {
    const { service, db } = setup();

    await expect(service.finishConsultation('apt-1', dto(MISSING_MEDICATION), 'u1')).rejects.toThrow(
      NotFoundException,
    );

    expect(db.rows(MedicalHistory)).toHaveLength(0);
    expect(db.rows(Recipe)).toHaveLength(0);
    expect(status(db)).toBe(AppointmentStatus.IN_CONSULTATION);
  });

  it('a failure after the history insert rolls it back, and the retry succeeds', async () => {
    const { service, db } = setup();
    db.failSaves(RecipeItem, 1);

    await expect(service.finishConsultation('apt-1', dto(), 'u1')).rejects.toThrow();
    expect(db.rows(MedicalHistory)).toHaveLength(0);
    expect(status(db)).toBe(AppointmentStatus.IN_CONSULTATION);

    // Before the fix the retry hit the unique index on medical_appointment_id.
    await service.finishConsultation('apt-1', dto(), 'u1');

    expect(db.rows(MedicalHistory)).toHaveLength(1);
    expect(db.rows(Recipe)).toHaveLength(1);
    expect(db.rows(RecipeItem)).toHaveLength(1);
    expect(status(db)).toBe(AppointmentStatus.COMPLETED);
  });

  it('an already completed appointment → 400 without a second history', async () => {
    const { service, db } = setup();
    await service.finishConsultation('apt-1', dto(), 'u1');

    await expect(service.finishConsultation('apt-1', dto(), 'u1')).rejects.toThrow(
      BadRequestException,
    );
    expect(db.rows(MedicalHistory)).toHaveLength(1);
  });

  it('a cancelled appointment → 400, stays cancelled and gets no history', async () => {
    const { service, db } = setup();
    db.rows(MedicalAppointment)[0].status = AppointmentStatus.CANCELLED;

    await expect(service.finishConsultation('apt-1', dto(), 'u1')).rejects.toThrow(
      'No se puede finalizar una cita cancelada.',
    );
    expect(status(db)).toBe(AppointmentStatus.CANCELLED);
    expect(db.rows(MedicalHistory)).toHaveLength(0);
  });

  it('a soft-deleted medication counts as missing', async () => {
    const { service, db } = setup();
    db.rows(Medication)[0].deletedAt = new Date();

    await expect(service.finishConsultation('apt-1', dto(), 'u1')).rejects.toThrow(
      NotFoundException,
    );
    expect(db.rows(MedicalHistory)).toHaveLength(0);
  });
});

describe('finishConsultation — contrato del frontend (M-35)', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const body = {
    observations: 'Notas de la cita',
    medicalHistory: { consultationDate: '2026-09-26', reasonForVisit: 'control', observations: 'Notas del médico' },
    recipe: {
      items: [
        { medicationName: 'Ibuprofeno', dosage: '400mg', frequency: '8h', quantity: 2 },
        { medicationName: 'Paracetamol', dosage: '500mg', frequency: '12h' },
      ],
    },
  };

  it('persiste medicalHistory.observations y la cantidad de cada ítem (1 si no se envía)', async () => {
    const { service, db } = setup();
    const validated = await pipe.transform(body, { type: 'body', metatype: CompleteConsultationDto });

    await service.finishConsultation('apt-1', validated, 'u1');

    expect(db.rows(MedicalHistory)[0].observations).toBe('Notas del médico');
    expect(db.rows(RecipeItem).map((i) => i.quantity).sort()).toEqual([1, 2]);
  });

  it('rechaza una cantidad no entera o menor que 1', async () => {
    for (const quantity of [0, 1.5, '2']) {
      const bad = { ...body, recipe: { items: [{ ...body.recipe.items[0], quantity }] } };
      await expect(pipe.transform(bad, { type: 'body', metatype: CompleteConsultationDto })).rejects.toThrow(
        BadRequestException,
      );
    }
  });
});

describe('finishConsultation — only open, attended appointments of the caller (MJ-27)', () => {
  it('a pending appointment → 400, stays pending and gets no history', async () => {
    const { service, db } = setup();
    db.rows(MedicalAppointment)[0].status = AppointmentStatus.PENDING;

    await expect(service.finishConsultation('apt-1', dto(), 'u1')).rejects.toThrow(
      'Solo se puede finalizar la consulta de una cita confirmada o en consulta.',
    );
    expect(status(db)).toBe(AppointmentStatus.PENDING);
    expect(db.rows(MedicalHistory)).toHaveLength(0);
  });

  it('a confirmed appointment closes like one in consultation', async () => {
    const { service, db } = setup();
    db.rows(MedicalAppointment)[0].status = AppointmentStatus.CONFIRMED;

    await service.finishConsultation('apt-1', dto(), 'u1');

    expect(status(db)).toBe(AppointmentStatus.COMPLETED);
  });

  it('doctor A closing doctor B appointment → 403, no history and the status stays', async () => {
    const { service, db } = setup(authContextForUsers(SCOPE_USERS));
    db.rows(MedicalAppointment)[0].doctorId = 'doc-b';

    await expect(service.finishConsultation('apt-1', dto(), 'user-a')).rejects.toThrow(ForbiddenException);
    expect(status(db)).toBe(AppointmentStatus.IN_CONSULTATION);
    expect(db.rows(MedicalHistory)).toHaveLength(0);
  });

  it('doctor A closes their own appointment', async () => {
    const { service, db } = setup(authContextForUsers(SCOPE_USERS));
    db.rows(MedicalAppointment)[0].doctorId = 'doc-a';

    await service.finishConsultation('apt-1', dto(), 'user-a');

    expect(status(db)).toBe(AppointmentStatus.COMPLETED);
    expect(db.rows(MedicalHistory)[0]).toMatchObject({ doctorId: 'doc-a', patientId: 'pat-1' });
  });

  it('admin closes any doctor appointment', async () => {
    const { service, db } = setup(authContextForUsers(SCOPE_USERS));
    db.rows(MedicalAppointment)[0].doctorId = 'doc-b';
    db.rows(Doctor).push({ id: 'doc-b', deletedAt: null });

    await service.finishConsultation('apt-1', dto(), 'user-admin');

    expect(status(db)).toBe(AppointmentStatus.COMPLETED);
  });
});
