import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EmailService } from 'src/email/email.service';

/**
 * @summary Procesador de trabajos de envío de correos electrónicos.
 * @description
 * Este procesador escucha la cola `emailQueue` y ejecuta en background
 * las tareas pendientes relacionadas con el envío de correos.  
 * 
 * Usa el decorador `@Processor('emailQueue')` para asociarse a la cola correspondiente.
 * Cada vez que se agrega un nuevo job, el método `process()` es invocado automáticamente
 * por BullMQ, ejecutando la lógica definida en este servicio.
 */
@Processor('emailQueue')
export class EmailProcessor extends WorkerHost {
  /**
   * @summary Inyección del servicio de correo electrónico.
   * @description
   * `EmailService` contiene la lógica para enviar correos simples o con plantillas dinámicas.
   * Este servicio es utilizado dentro del método `process()` para manejar
   * el envío de correos según el tipo de trabajo recibido.
   */
  constructor(private readonly emailService: EmailService) {
    super();
  }

  /**
   * @summary Procesa y ejecuta un trabajo en la cola `emailQueue`.
   * @description
   * Este método se ejecuta automáticamente cada vez que un nuevo trabajo
   * entra en la cola de BullMQ.
   *
   * - Si el tipo de trabajo (`type`) es `'template'`, se usa `sendEmailWithTemplate()`
   *   para enviar un correo basado en una plantilla HTML con datos dinámicos.
   * - En caso contrario, se envía un correo simple con `sendEmail()`.
   *
   * @param job Objeto `Job` proporcionado por BullMQ que contiene la data del trabajo.
   * @returns Resultado del trabajo ejecutado.
   *
   * @example
   * ```ts
   * await this.emailQueue.add('sendMail', {
   *   type: 'template',
   *   dto: { to: 'cliente@dominio.com', subject: 'Bienvenido' },
   *   replacements: { nombre: 'Carlos' }
   * });
   * ```
   */
  async process(job: Job<any, any, string>) {
    const { type, dto, replacements } = job.data;

    if (type === 'template') {
      await this.emailService.sendEmailWithTemplate(dto, replacements);
    } else {
      await this.emailService.sendEmail(dto);
    }

    return { status: 'ok', jobId: job.id };
  }
}
