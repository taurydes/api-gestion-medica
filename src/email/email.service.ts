import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as nodemailer from 'nodemailer';
import * as path from 'path';
import { CreateEmailDto } from './dto/create-email.dto';

/**
 * Servicio: EmailService
 *
 * Maneja el envío de correos electrónicos con o sin plantillas HTML.
 * Utiliza nodemailer como adaptador SMTP y admite archivos adjuntos.
 */
@Injectable()
export class EmailService {
    constructor(
    @InjectQueue('emailQueue') private readonly emailQueue: Queue,
  ) {}
  /** Configura el transporte SMTP a partir de variables de entorno. */
  private transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  /** Convierte contenido base64 a Buffer, manejando formato data URL. */
  private extractBase64(data: string): Buffer {
    if (data.startsWith('data:')) {
      const base64 = data.split(',')[1];
      return Buffer.from(base64, 'base64');
    }
    return Buffer.from(data, 'base64');
  }

  /** Envía un correo electrónico con cuerpo HTML y adjuntos opcionales. */
  async sendEmail(dto: CreateEmailDto) {
    const attachments = dto.attachments?.map((att) => ({
      filename: att.filename,
      content: this.extractBase64(att.content),
      contentType: att.contentType,
    }));

    return await this.transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: dto.to,
      subject: dto.subject,
      html: dto.content,
      attachments,
    });
  }

  /** Carga y reemplaza variables en una plantilla HTML. */
  private getHtmlTemplate(replacements: Record<string, string>): string {
    const templatePath = path.resolve(
      process.cwd(),
      'src',
      'common',
      'templates',
      'initial.html',
    );
    let html = fs.readFileSync(templatePath, 'utf8');
    for (const key in replacements) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), replacements[key]);
    }
    return html;
  }

  /** Envía un correo electrónico utilizando una plantilla HTML predefinida. */
  async sendEmailWithTemplate(
    dto: CreateEmailDto,
    replacements: Record<string, string>,
  ) {
    const attachments = dto.attachments?.map((att) => ({
      filename: att.filename,
      content: this.extractBase64(att.content),
      contentType: att.contentType,
    }));

    const htmlContent = this.getHtmlTemplate(replacements);

    return await this.transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: dto.to,
      subject: dto.subject,
      html: htmlContent,
      attachments,
    });
  }

    async sendEmailQueued(dto: CreateEmailDto, replacements?: Record<string, string>) {
    const type = replacements ? 'template' : 'simple';

    await this.emailQueue.add('sendEmail', {
      type,
      dto,
      replacements,
    });

    return { message: 'Correo encolado correctamente' };
  }
}

