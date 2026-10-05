import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { authContextForUsers, SCOPE_USERS } from '../../test/auth-context-stub';
import { FakeFlowProducer, FakeQueue } from '../../test/fake-queue';
import { RECIPE_FIXTURE } from '../../test/recipe-pdf-fixture';
import { RecipePdfService } from 'src/documents/recipe-pdf.service';
import { AppointmentStatus } from 'src/medical-appointments/entities/medical-appointment.entity';
import {
  APPOINTMENT_NOT_COMPLETED,
  APPOINTMENT_SUMMARY_JOB,
  CONFIDENTIAL_FOOTER,
  EMAIL_FAILED,
  EMAIL_SCOPE_FORBIDDEN,
  MAIL_DISABLED,
  mailSettings,
  NO_PATIENT_EMAIL,
  RECIPE_EMAIL_JOB,
} from './email.const';
import { EmailProcessor } from './email.processor';
import { EmailService } from './email.service';
import { appointmentSummaryMail } from './mail-content';

// The doctor has no signature or stamp: these specs cover the queues, not the images.
const NO_CREDENTIALS = { dataUrls: async () => ({ signature: null, stamp: null }) } as any;

const RECIPE_ID = RECIPE_FIXTURE.id;
const APT_ID = '4d7f1b2c-5e6a-4b8c-9d0e-1f2a3b4c5d6e';

/** Stand-in for findOne over one row, matching on where.id only. */
const repoOf = (rows: any[]) => ({
  findOne: jest.fn(
    async ({ where }: any) =>
      rows.find((r) => r.id === where.id && !r.deletedAt) ?? null,
  ),
});

function setup(
  options: {
    enabled?: boolean;
    patientEmail?: string | null;
    status?: AppointmentStatus;
  } = {},
) {
  const enabled = options.enabled ?? true;
  const patientEmail =
    options.patientEmail === undefined
      ? 'ana@example.com'
      : options.patientEmail;
  const recipe = {
    ...RECIPE_FIXTURE,
    doctorId: 'doc-b',
    patient: { ...RECIPE_FIXTURE.patient, email: patientEmail },
    updatedAt: new Date('2026-10-05T10:00:00.000Z'),
    deletedAt: null,
  };
  const appointment = {
    id: APT_ID,
    doctorId: 'doc-b',
    status: options.status ?? AppointmentStatus.COMPLETED,
    appointmentDate: new Date('2026-10-05T13:00:00.000Z'),
    reason: 'Dolor de garganta',
    observations: null,
    deletedAt: null,
    patient: { email: patientEmail },
    doctor: RECIPE_FIXTURE.doctor,
    medicalCenter: { name: 'Clínica Central' },
    medicalHistory: {
      consultationDate: new Date('2026-10-05T13:30:00.000Z'),
      reasonForVisit: 'Dolor de garganta',
      diagnosis: 'Faringitis aguda',
      observations: 'Paciente estable',
      symptoms: 'SINTOMA-PRIVADO',
      treatmentPlan: 'PLAN-PRIVADO',
      requestedExams: [{ name: 'Hemograma', notes: 'NOTA-PRIVADA' }],
    },
    recipes: [
      {
        id: RECIPE_ID,
        recipeNumber: RECIPE_FIXTURE.recipeNumber,
        deletedAt: null,
      },
    ],
  };
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'email-spec-'));
  const config = {
    get: (key: string) =>
      ({ MAIL_ENABLED: String(enabled), UPLOADS_PATH: uploadsDir })[key],
  };
  const transport = {
    settings: mailSettings(config.get),
    send: jest.fn().mockResolvedValue(undefined),
  };
  const queues = {
    documents: new FakeQueue('documents'),
    email: new FakeQueue('email'),
  };
  const flow = new FakeFlowProducer(queues);
  const recipeRepo = repoOf([recipe]);
  const appointmentRepo = repoOf([appointment]);
  const service = new EmailService(
    flow as any,
    recipeRepo as any,
    appointmentRepo as any,
    authContextForUsers({
      ...SCOPE_USERS,
      'user-staff': { isAdmin: false, doctorId: null },
    }),
    transport as any,
  );
  const recipePdf = new RecipePdfService(recipeRepo as any, config as any, NO_CREDENTIALS);
  const accessLog = { insert: jest.fn().mockResolvedValue(undefined) };
  const processor = new EmailProcessor(
    transport as any,
    recipePdf,
    appointmentRepo as any,
    accessLog as any,
  );
  return {
    service,
    processor,
    flow,
    queues,
    transport,
    accessLog,
    appointment,
    recipe,
  };
}

describe('EmailService — who may send and to whom', () => {
  it('recipe email defaults to the patient email and waits on a PDF child job', async () => {
    const { service, flow, queues } = setup();
    const { jobId } = await service.enqueueRecipeEmail(
      RECIPE_ID,
      undefined,
      'user-b',
    );

    const [sent] = flow.flows;
    expect(sent).toMatchObject({
      name: RECIPE_EMAIL_JOB,
      queueName: 'email',
      opts: { jobId, attempts: 3 },
      data: {
        to: 'ana@example.com',
        requesterId: 'user-b',
        recipeId: RECIPE_ID,
        attachmentRecipeIds: [RECIPE_ID],
      },
    });
    expect(sent.children).toEqual([
      expect.objectContaining({
        name: 'recipe-pdf',
        queueName: 'documents',
        data: { recipeId: RECIPE_ID, requesterId: 'user-b' },
        opts: expect.objectContaining({ failParentOnFailure: true }),
      }),
    ]);
    expect((await queues.email.getJob(jobId))?.state).toBe('waiting-children');
  });

  it('"to" overrides the recipient', async () => {
    const { service, flow } = setup();
    await service.enqueueRecipeEmail(RECIPE_ID, 'otro@example.com', 'user-b');
    expect(flow.flows[0].data.to).toBe('otro@example.com');
  });

  it('no patient email and no "to" → 400', async () => {
    const { service, flow } = setup({ patientEmail: null });
    await expect(
      service.enqueueRecipeEmail(RECIPE_ID, undefined, 'user-b'),
    ).rejects.toThrow(NO_PATIENT_EMAIL);
    expect(flow.flows).toHaveLength(0);
  });

  it('MAIL_ENABLED=false → 503 before anything else', async () => {
    const { service, flow } = setup({ enabled: false });
    await expect(
      service.enqueueRecipeEmail(RECIPE_ID, undefined, 'user-b'),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      service.enqueueAppointmentSummary(APT_ID, undefined, 'user-b'),
    ).rejects.toThrow(MAIL_DISABLED);
    expect(flow.flows).toHaveLength(0);
  });

  it.each(['user-a', 'user-staff'])(
    '%s (not the consultation doctor) → 403 on both endpoints',
    async (user) => {
      const { service, flow } = setup();
      await expect(
        service.enqueueRecipeEmail(RECIPE_ID, undefined, user),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.enqueueAppointmentSummary(APT_ID, undefined, user),
      ).rejects.toThrow(EMAIL_SCOPE_FORBIDDEN);
      expect(flow.flows).toHaveLength(0);
    },
  );

  it('an admin may send; an unknown recipe is 404', async () => {
    const { service } = setup();
    await expect(
      service.enqueueRecipeEmail(RECIPE_ID, undefined, 'user-admin'),
    ).resolves.toHaveProperty('jobId');
    await expect(
      service.enqueueRecipeEmail(
        '7e1f0000-0000-4000-8000-000000000000',
        undefined,
        'user-admin',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('summary of an appointment that is not completed → 400', async () => {
    const { service } = setup({ status: AppointmentStatus.IN_CONSULTATION });
    await expect(
      service.enqueueAppointmentSummary(APT_ID, undefined, 'user-b'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.enqueueAppointmentSummary(APT_ID, undefined, 'user-b'),
    ).rejects.toThrow(APPOINTMENT_NOT_COMPLETED);
  });

  it('summary attaches the appointment recipes as PDF child jobs', async () => {
    const { service, flow } = setup();
    await service.enqueueAppointmentSummary(APT_ID, undefined, 'user-b');
    expect(flow.flows[0]).toMatchObject({
      name: APPOINTMENT_SUMMARY_JOB,
      data: {
        to: 'ana@example.com',
        appointmentId: APT_ID,
        attachmentRecipeIds: [RECIPE_ID],
      },
    });
    expect(flow.flows[0].children).toHaveLength(1);
  });
});

describe('EmailProcessor — builds and sends the message', () => {
  it('recipe email: recipient, Spanish summary and only the recipe PDF attached; the send is logged', async () => {
    const { service, processor, queues, transport, accessLog } = setup();
    const { jobId } = await service.enqueueRecipeEmail(
      RECIPE_ID,
      undefined,
      'user-b',
    );

    await processor.process((await queues.email.getJob(jobId)) as any);

    const mail = transport.send.mock.calls[0][0];
    expect(mail.to).toBe('ana@example.com');
    expect(mail.subject).toBe('Receta médica REC-2026-00042 - Clínica Central');
    for (const part of [
      'Clínica Central',
      'Dr(a). Carlos Mendoza',
      'REC-2026-00042',
      CONFIDENTIAL_FOOTER,
    ]) {
      expect(mail.text).toContain(part);
    }
    expect(mail.attachments).toEqual([
      {
        filename: 'receta-REC-2026-00042.pdf',
        path: expect.stringMatching(/documents[\\/].+\.pdf$/),
        contentType: 'application/pdf',
      },
    ]);
    expect(
      fs.readFileSync(mail.attachments[0].path).subarray(0, 5).toString(),
    ).toBe('%PDF-');
    expect(accessLog.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-b',
        action: 'email_sent',
        resource: 'recipes',
        resourceId: RECIPE_ID,
      }),
    );
    expect(JSON.stringify(accessLog.insert.mock.calls)).not.toContain(
      'ana@example.com',
    );
  });

  it('summary: date, doctor, reason, diagnosis, observations and exams — no other clinical detail', async () => {
    const { service, processor, queues, transport } = setup();
    const { jobId } = await service.enqueueAppointmentSummary(
      APT_ID,
      'otro@example.com',
      'user-b',
    );

    await processor.process((await queues.email.getJob(jobId)) as any);

    const mail = transport.send.mock.calls[0][0];
    expect(mail.to).toBe('otro@example.com');
    for (const part of [
      'Dr(a). Carlos Mendoza',
      'Dolor de garganta',
      'Faringitis aguda',
      'Paciente estable',
      'Hemograma',
      CONFIDENTIAL_FOOTER,
    ]) {
      expect(mail.text).toContain(part);
      expect(mail.html).toContain(part);
    }
    for (const secret of ['SINTOMA-PRIVADO', 'PLAN-PRIVADO', 'NOTA-PRIVADA']) {
      expect(mail.text + mail.html).not.toContain(secret);
    }
    expect(mail.attachments).toHaveLength(1);
  });

  it('an SMTP failure is retried with a generic error, not the server detail', async () => {
    const { service, processor, queues, transport, accessLog } = setup();
    transport.send.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 172.18.0.9:1025'),
    );
    const { jobId } = await service.enqueueRecipeEmail(
      RECIPE_ID,
      undefined,
      'user-b',
    );

    await expect(
      processor.process((await queues.email.getJob(jobId)) as any),
    ).rejects.toThrow(EMAIL_FAILED);
    expect(accessLog.insert).not.toHaveBeenCalled();
  });

  it('a job processed while mail is off fails without retries', async () => {
    const { processor } = setup({ enabled: false });
    await expect(processor.process({ data: {} } as any)).rejects.toThrow(
      UnrecoverableError,
    );
  });

  it('the HTML escapes user text', () => {
    const { html } = appointmentSummaryMail({
      appointmentDate: new Date(),
      centerName: 'C',
      doctorName: 'D',
      reason: '<script>x</script>',
      diagnosis: null,
      observations: null,
      requestedExams: [],
      recipeNumbers: [],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
