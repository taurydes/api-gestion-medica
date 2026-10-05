import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, UnrecoverableError } from 'bullmq';
import { AccessLog } from 'src/audit/entities/access-log.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { EMAIL_QUEUE } from 'src/documents/documents.const';
import { fullName } from 'src/documents/recipe-pdf.builder';
import { RecipePdfService } from 'src/documents/recipe-pdf.service';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';
import { IsNull, Repository } from 'typeorm';
import {
  EMAIL_FAILED,
  EmailJobData,
  MAIL_DISABLED,
  RECIPE_EMAIL_JOB,
} from './email.const';
import {
  appointmentSummaryMail,
  MailContent,
  recipeMail,
} from './mail-content';
import { MailTransport, OutgoingMail } from './mail-transport';

const DEFAULT_CENTER = 'Centro Médico';

/** Worker of the `email` queue: runs after its PDF child jobs, builds the message and sends it. */
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly transport: MailTransport,
    private readonly recipePdf: RecipePdfService,
    @InjectRepository(MedicalAppointment, DatabaseConnectionName.DB_MAIN)
    private readonly appointments: Repository<MedicalAppointment>,
    @InjectRepository(AccessLog, DatabaseConnectionName.DB_MAIN)
    private readonly accessLog: Repository<AccessLog>,
  ) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<{ sentAt: string }> {
    if (!this.transport.settings.enabled)
      throw new UnrecoverableError(MAIL_DISABLED);
    let mail: OutgoingMail;
    try {
      mail = await this.buildMail(job.data);
    } catch (error) {
      if (error instanceof NotFoundException)
        throw new UnrecoverableError(error.message);
      throw error;
    }
    try {
      await this.transport.send(mail);
    } catch (error) {
      // failedReason reaches the client: the SMTP detail stays in the log.
      this.logger.error(
        `Correo ${job.id} (${job.data.kind}): ${(error as Error)?.message}`,
      );
      throw new Error(EMAIL_FAILED);
    }
    await this.logSend(job.data);
    return { sentAt: new Date().toISOString() };
  }

  /** Recipient, summary and the recipe PDFs (already rendered by the child jobs, so a cache hit). */
  async buildMail(data: EmailJobData): Promise<OutgoingMail> {
    const content =
      data.kind === RECIPE_EMAIL_JOB
        ? await this.recipeContent(data.recipeId!)
        : await this.summaryContent(data.appointmentId!);
    const attachments: OutgoingMail['attachments'] = [];
    for (const recipeId of data.attachmentRecipeIds) {
      const pdf = await this.recipePdf.ensurePdf(recipeId);
      attachments.push({
        filename: `receta-${pdf.recipeNumber}.pdf`,
        path: pdf.path,
        contentType: 'application/pdf',
      });
    }
    return { to: data.to, ...content, attachments };
  }

  private async recipeContent(recipeId: string): Promise<MailContent> {
    const recipe = await this.recipePdf.loadRecipe(recipeId);
    return recipeMail({
      recipeNumber: recipe.recipeNumber,
      issueDate: recipe.issueDate,
      centerName: recipe.medicalHistory?.medicalCenter?.name || DEFAULT_CENTER,
      doctorName: `Dr(a). ${fullName(recipe.doctor?.commonPerson)}`,
    });
  }

  private async summaryContent(appointmentId: string): Promise<MailContent> {
    const appointment = await this.appointments.findOne({
      where: { id: appointmentId, deletedAt: IsNull() },
      relations: {
        doctor: { commonPerson: true },
        medicalCenter: true,
        medicalHistory: true,
        recipes: true,
      },
    });
    if (!appointment)
      throw new NotFoundException(
        `Cita médica con ID ${appointmentId} no encontrada.`,
      );
    const history = appointment.medicalHistory;
    return appointmentSummaryMail({
      appointmentDate: history?.consultationDate ?? appointment.appointmentDate,
      centerName: appointment.medicalCenter?.name || DEFAULT_CENTER,
      doctorName: `Dr(a). ${fullName(appointment.doctor?.commonPerson)}`,
      reason: history?.reasonForVisit || appointment.reason || null,
      diagnosis: history?.diagnosis || null,
      observations: history?.observations || appointment.observations || null,
      requestedExams: (history?.requestedExams ?? [])
        .map((exam) => exam.name)
        .filter(Boolean),
      recipeNumbers: (appointment.recipes ?? [])
        .filter((r) => !r.deletedAt)
        .map((r) => r.recipeNumber),
    });
  }

  /** One access_log row per delivered email; the address is not stored. A failed insert never fails the send. */
  private async logSend(data: EmailJobData): Promise<void> {
    const isRecipe = data.kind === RECIPE_EMAIL_JOB;
    await this.accessLog
      .insert({
        userId: data.requesterId,
        method: 'QUEUE',
        path: `/email/${data.kind}`,
        resource: isRecipe ? 'recipes' : 'medical-appointments',
        resourceId: (isRecipe ? data.recipeId : data.appointmentId) ?? null,
        action: 'email_sent',
        statusCode: 200,
        ip: null,
      })
      .catch((error) =>
        this.logger.error(`No se pudo registrar el envío: ${error.message}`),
      );
  }
}
