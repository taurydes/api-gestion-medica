import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { MailSettings, mailSettings } from './email.const';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments: Array<{
    filename: string;
    path: string;
    contentType: 'application/pdf';
  }>;
}

/** Thin nodemailer wrapper so the worker can be tested with a fake transport. */
@Injectable()
export class MailTransport {
  readonly settings: MailSettings;
  private transporter?: Transporter;

  constructor(config: ConfigService) {
    this.settings = mailSettings((key) => config.get(key));
  }

  async send(mail: OutgoingMail): Promise<void> {
    this.transporter ??= createTransport({
      host: this.settings.host,
      port: this.settings.port,
      secure: this.settings.secure,
      auth: this.settings.user
        ? { user: this.settings.user, pass: this.settings.pass }
        : undefined,
    });
    await this.transporter.sendMail({ from: this.settings.from, ...mail });
  }
}
