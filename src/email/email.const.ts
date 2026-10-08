export const RECIPE_EMAIL_JOB = 'recipe-email';
export const APPOINTMENT_SUMMARY_JOB = 'appointment-summary';

export const MAIL_DISABLED = 'El envío de correos no está configurado.';
export const NO_PATIENT_EMAIL = 'El paciente no tiene correo registrado.';
export const APPOINTMENT_NOT_COMPLETED =
  'Solo se puede enviar el resumen de una cita completada.';
export const EMAIL_SCOPE_FORBIDDEN =
  'Solo el médico de la consulta o un administrador puede enviar este correo.';
export const EMAIL_FAILED = 'No se pudo enviar el correo.';

export const CONFIDENTIAL_FOOTER =
  'Documento confidencial: contiene información médica dirigida solo a su destinatario. ' +
  'Si lo recibió por error, elimínelo y avise al remitente.';

export interface EmailJobData {
  kind: typeof RECIPE_EMAIL_JOB | typeof APPOINTMENT_SUMMARY_JOB;
  requesterId: string;
  to: string;
  recipeId?: string;
  appointmentId?: string;
  /** Recipes whose PDFs go attached; each one is a documents child job of this email job. */
  attachmentRecipeIds: string[];
}

export interface MailSettings {
  enabled: boolean;
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

const truthy = (value: unknown) =>
  ['true', '1', 'yes'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );

/** SMTP settings from env; MAIL_ENABLED=false (the default) turns every send endpoint into a 503. */
export function mailSettings(get: (key: string) => unknown): MailSettings {
  return {
    enabled: truthy(get('MAIL_ENABLED')),
    host: (get('SMTP_HOST') as string) || undefined,
    port: Number(get('SMTP_PORT')) || 587,
    secure: truthy(get('SMTP_SECURE')),
    user: (get('SMTP_USER') as string) || undefined,
    pass: (get('SMTP_PASS') as string) || undefined,
    from: (get('MAIL_FROM') as string) || 'VIBE <no-reply@vibe.local>',
  };
}
