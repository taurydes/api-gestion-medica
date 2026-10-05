import { formatDate } from 'src/documents/recipe-pdf.builder';
import { CONFIDENTIAL_FOOTER } from './email.const';

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

export interface RecipeMailData {
  recipeNumber: string;
  issueDate: Date | string;
  centerName: string;
  doctorName: string;
}

/** Only these fields reach the patient's inbox: no vitals, symptoms, exam findings or treatment plan. */
export interface AppointmentSummaryMailData {
  appointmentDate: Date | string;
  centerName: string;
  doctorName: string;
  reason: string | null;
  diagnosis: string | null;
  observations: string | null;
  requestedExams: string[];
  recipeNumbers: string[];
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

type Line = [label: string, value: string];

function render(
  subject: string,
  intro: string,
  lines: Line[],
  extra: { title: string; items: string[] } | null,
  closing: string,
): MailContent {
  const textLines = lines.map(([label, value]) => `${label}: ${value}`);
  const extraText = extra?.items.length
    ? [`${extra.title}:`, ...extra.items.map((item) => `- ${item}`)]
    : [];
  const text = [
    intro,
    '',
    ...textLines,
    ...(extraText.length ? ['', ...extraText] : []),
    '',
    closing,
    '',
    '--',
    CONFIDENTIAL_FOOTER,
  ].join('\n');

  const rows = lines
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${escapeHtml(label)}</td><td style="padding:4px 0"><strong>${escapeHtml(value)}</strong></td></tr>`,
    )
    .join('');
  const extraHtml = extra?.items.length
    ? `<p style="margin:16px 0 4px">${escapeHtml(extra.title)}:</p><ul>${extra.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b">` +
    `<p>${escapeHtml(intro)}</p><table>${rows}</table>${extraHtml}<p>${escapeHtml(closing)}</p>` +
    `<hr style="border:none;border-top:1px solid #e2e8f0"><p style="font-size:11px;color:#94a3b8">${escapeHtml(CONFIDENTIAL_FOOTER)}</p></div>`;
  return { subject, text, html };
}

export function recipeMail(data: RecipeMailData): MailContent {
  return render(
    `Receta médica ${data.recipeNumber} - ${data.centerName}`,
    'Le enviamos la receta médica emitida en su consulta.',
    [
      ['Centro', data.centerName],
      ['Médico', data.doctorName],
      ['Fecha', formatDate(data.issueDate)],
      ['Receta Nro.', data.recipeNumber],
    ],
    null,
    'La receta va adjunta en PDF.',
  );
}

export function appointmentSummaryMail(
  data: AppointmentSummaryMailData,
): MailContent {
  const lines: Line[] = [
    ['Centro', data.centerName],
    ['Médico', data.doctorName],
    ['Fecha', formatDate(data.appointmentDate, true)],
  ];
  if (data.reason) lines.push(['Motivo', data.reason]);
  if (data.diagnosis) lines.push(['Diagnóstico', data.diagnosis]);
  if (data.observations) lines.push(['Observaciones', data.observations]);
  return render(
    `Resumen de su consulta - ${data.centerName}`,
    'Le enviamos el resumen de su consulta médica.',
    lines,
    { title: 'Exámenes solicitados', items: data.requestedExams },
    data.recipeNumbers.length
      ? `Se adjunta la receta (${data.recipeNumbers.join(', ')}) en PDF.`
      : 'En esta consulta no se emitió receta.',
  );
}
