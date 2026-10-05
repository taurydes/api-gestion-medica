import { InjectFlowProducer } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FlowProducer } from 'bullmq';
import { randomUUID } from 'crypto';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import {
  DEFAULT_JOB_OPTIONS,
  DOCUMENTS_QUEUE,
  EMAIL_QUEUE,
  RECIPE_PDF_JOB,
  RecipePdfJobData,
} from 'src/documents/documents.const';
import {
  AppointmentStatus,
  MedicalAppointment,
} from 'src/medical-appointments/entities/medical-appointment.entity';
import { Recipe } from 'src/recipe/entities/recipe.entity';
import { IsNull, Repository } from 'typeorm';
import {
  APPOINTMENT_NOT_COMPLETED,
  APPOINTMENT_SUMMARY_JOB,
  EMAIL_SCOPE_FORBIDDEN,
  EmailJobData,
  MAIL_DISABLED,
  NO_PATIENT_EMAIL,
  RECIPE_EMAIL_JOB,
} from './email.const';
import { MailTransport } from './mail-transport';

/** Validates a send request and enqueues it as an email job whose recipe PDFs are documents child jobs. */
@Injectable()
export class EmailService {
  constructor(
    @InjectFlowProducer(EMAIL_QUEUE) private readonly flow: FlowProducer,
    @InjectRepository(Recipe, DatabaseConnectionName.DB_MAIN)
    private readonly recipes: Repository<Recipe>,
    @InjectRepository(MedicalAppointment, DatabaseConnectionName.DB_MAIN)
    private readonly appointments: Repository<MedicalAppointment>,
    private readonly authContext: AuthContextService,
    private readonly transport: MailTransport,
  ) {}

  get enabled(): boolean {
    return this.transport.settings.enabled;
  }

  async enqueueRecipeEmail(
    recipeId: string,
    to: string | undefined,
    userId: string,
  ): Promise<{ jobId: string }> {
    this.assertEnabled();
    const recipe = await this.recipes.findOne({
      where: { id: recipeId, deletedAt: IsNull() },
      relations: { patient: true },
    });
    if (!recipe)
      throw new NotFoundException(`Receta con ID ${recipeId} no encontrada.`);
    await this.assertScope(userId, recipe.doctorId);
    return this.enqueue({
      kind: RECIPE_EMAIL_JOB,
      requesterId: userId,
      to: this.recipient(to, recipe.patient?.email),
      recipeId,
      attachmentRecipeIds: [recipeId],
    });
  }

  async enqueueAppointmentSummary(
    appointmentId: string,
    to: string | undefined,
    userId: string,
  ): Promise<{ jobId: string }> {
    this.assertEnabled();
    const appointment = await this.appointments.findOne({
      where: { id: appointmentId, deletedAt: IsNull() },
      relations: { patient: true, recipes: true },
    });
    if (!appointment)
      throw new NotFoundException(
        `Cita médica con ID ${appointmentId} no encontrada.`,
      );
    await this.assertScope(userId, appointment.doctorId);
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException(APPOINTMENT_NOT_COMPLETED);
    }
    return this.enqueue({
      kind: APPOINTMENT_SUMMARY_JOB,
      requesterId: userId,
      to: this.recipient(to, appointment.patient?.email),
      appointmentId,
      attachmentRecipeIds: (appointment.recipes ?? [])
        .filter((r) => !r.deletedAt)
        .map((r) => r.id),
    });
  }

  private assertEnabled(): void {
    if (!this.enabled) throw new ServiceUnavailableException(MAIL_DISABLED);
  }

  /** Doctor of the consultation or an admin; other staff and other doctors get 403. */
  private async assertScope(
    userId: string,
    ownerDoctorId: string,
  ): Promise<void> {
    if (await this.authContext.isAdmin(userId)) return;
    const doctorId = await this.authContext.getDoctorIdForUser(userId);
    if (!doctorId || doctorId !== ownerDoctorId)
      throw new ForbiddenException(EMAIL_SCOPE_FORBIDDEN);
  }

  private recipient(
    to: string | undefined,
    patientEmail: string | null | undefined,
  ): string {
    const recipient = (to ?? '').trim() || (patientEmail ?? '').trim();
    if (!recipient) throw new BadRequestException(NO_PATIENT_EMAIL);
    return recipient;
  }

  private async enqueue(data: EmailJobData): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    await this.flow.add({
      name: data.kind,
      queueName: EMAIL_QUEUE,
      data,
      // Flow jobs do not inherit the queue's defaultJobOptions.
      opts: { ...DEFAULT_JOB_OPTIONS, jobId },
      children: data.attachmentRecipeIds.map((recipeId) => ({
        name: RECIPE_PDF_JOB,
        queueName: DOCUMENTS_QUEUE,
        data: {
          recipeId,
          requesterId: data.requesterId,
        } satisfies RecipePdfJobData,
        opts: {
          ...DEFAULT_JOB_OPTIONS,
          jobId: randomUUID(),
          failParentOnFailure: true,
        },
      })),
    });
    return { jobId };
  }
}
