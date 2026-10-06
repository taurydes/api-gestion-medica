import { createHash } from 'crypto';
import * as pdfmake from 'pdfmake';
import type { Column, Content, TDocumentDefinitions } from 'pdfmake/interfaces';

/** The subset of a loaded recipe the PDF prints; every relation may be missing on old rows. */
export interface RecipePdfData {
  id: string;
  recipeNumber: string;
  verificationCode?: string | null;
  issueDate: Date | string;
  diagnosis?: string | null;
  generalInstructions?: string | null;
  notes?: string | null;
  patient?: { commonPerson?: PersonName | null } | null;
  doctor?: {
    commonPerson?: PersonName | null;
    specialties?: Array<{ name: string }> | null;
  } | null;
  medicalHistory?: {
    medicalCenter?: { name?: string | null; address?: string | null } | null;
    specialty?: { name?: string | null } | null;
  } | null;
  items?: Array<{
    medicationName: string;
    presentation?: string | null;
    concentration?: string | null;
    dosage: string;
    frequency: string;
    duration?: string | null;
    quantity?: number | null;
    unit?: string | null;
    instructions?: string | null;
    orderNumber?: number | null;
  }> | null;
}

/** What the PDF prints besides the recipe row: the doctor's images (data URLs) and the public verify link. */
export interface RecipePdfExtras {
  signature?: string | null;
  stamp?: string | null;
  verificationUrl?: string | null;
}

export const VERIFY_LEGEND = 'Verifique la autenticidad de esta receta escaneando el código QR';
export const VERIFY_LINK_TEXT = 'o haga clic aquí para verificarla';
// Bump when the printed layout changes, so PDFs cached under the old layout regenerate.
const LAYOUT_VERSION = 2;

export interface PersonName {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  secondLastName?: string | null;
  letter?: string | null;
  documentNumber?: string | null;
}

const STANDARD_FONTS = [
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
];
pdfmake.setFonts({
  Helvetica: {
    normal: STANDARD_FONTS[0],
    bold: STANDARD_FONTS[1],
    italics: STANDARD_FONTS[2],
    bolditalics: STANDARD_FONTS[3],
  },
});
// Built-in PDF fonts only: no remote URL and no local file can be pulled into a document.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((path) => STANDARD_FONTS.includes(path));

const TIME_ZONE = 'America/Caracas';
const BLUE = '#1e3a8a';
const ACCENT = '#3b82f6';
const MUTED = '#64748b';

/** "Ana María Pérez Gómez" from the person's parts; never "undefined" when a part is missing. */
export function fullName(person?: PersonName | null): string {
  const parts = [
    person?.firstName,
    person?.middleName,
    person?.lastName,
    person?.secondLastName,
  ]
    .map((part) => (part ?? '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(' ') : 'Sin nombre registrado';
}

export function documentId(person?: PersonName | null): string {
  if (!person?.documentNumber) return 'Sin documento';
  return person.letter
    ? `${person.letter}-${person.documentNumber}`
    : person.documentNumber;
}

export function formatDate(value: Date | string, withTime = false): string {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value));
}

const text = (value: unknown, fallback = '—'): string => {
  const s = value === null || value === undefined ? '' : String(value).trim();
  return s || fallback;
};

const label = (value: string): Content => ({
  text: value,
  fontSize: 8,
  bold: true,
  color: '#94a3b8',
  margin: [0, 0, 0, 4],
});

const box = (title: string, main: string, sub: string): Content => ({
  table: {
    widths: ['*'],
    body: [
      [
        {
          stack: [
            label(title),
            { text: main, fontSize: 13, bold: true },
            { text: sub, fontSize: 9, color: MUTED, margin: [0, 3, 0, 0] },
          ],
          margin: [8, 8, 8, 8],
        },
      ],
    ],
  },
  layout: {
    hLineColor: () => '#e2e8f0',
    vLineColor: () => '#e2e8f0',
    fillColor: () => '#f8fafc',
  },
});

const section = (title: string, body: string, color: string): Content[] => [
  { text: title, fontSize: 9, bold: true, color, margin: [0, 14, 0, 4] },
  { text: body, fontSize: 10 },
];

/** pdfmake definition of the recipe: header, patient/doctor boxes, diagnosis, prescription table and signature. */
/** sha256 of every value the PDF prints (print date aside): the cache key of the generated file. */
export function recipePdfFingerprint(recipe: RecipePdfData, extras: RecipePdfExtras = {}): string {
  const digest = (value?: string | null) => (value ? createHash('sha256').update(value).digest('hex') : null);
  const person = (p?: PersonName | null) => [
    p?.firstName ?? null,
    p?.middleName ?? null,
    p?.lastName ?? null,
    p?.secondLastName ?? null,
    p?.letter ?? null,
    p?.documentNumber ?? null,
  ];
  const printed = {
    layout: LAYOUT_VERSION,
    id: recipe.id,
    recipeNumber: recipe.recipeNumber,
    issueDate: new Date(recipe.issueDate).toISOString(),
    diagnosis: recipe.diagnosis ?? null,
    generalInstructions: recipe.generalInstructions ?? null,
    notes: recipe.notes ?? null,
    patient: person(recipe.patient?.commonPerson),
    doctor: person(recipe.doctor?.commonPerson),
    doctorSpecialties: (recipe.doctor?.specialties ?? []).map((s) => s.name),
    specialty: recipe.medicalHistory?.specialty?.name ?? null,
    center: [
      recipe.medicalHistory?.medicalCenter?.name ?? null,
      recipe.medicalHistory?.medicalCenter?.address ?? null,
    ],
    items: [...(recipe.items ?? [])]
      .sort((a, b) => (a.orderNumber ?? 0) - (b.orderNumber ?? 0))
      .map((i) => [
        i.medicationName,
        i.presentation ?? null,
        i.concentration ?? null,
        i.dosage,
        i.frequency,
        i.duration ?? null,
        i.quantity ?? null,
        i.unit ?? null,
        i.instructions ?? null,
      ]),
    // A new signature, stamp or FRONTEND_URL changes the file, so the cached PDF must regenerate.
    signature: digest(extras.signature),
    stamp: digest(extras.stamp),
    verificationCode: recipe.verificationCode ?? null,
    verificationUrl: extras.verificationUrl ?? null,
  };
  return createHash('sha256').update(JSON.stringify(printed)).digest('hex');
}

export function buildRecipePdfDefinition(
  recipe: RecipePdfData,
  printedAt: Date = new Date(),
  extras: RecipePdfExtras = {},
): TDocumentDefinitions {
  const patientPerson = recipe.patient?.commonPerson;
  const doctorPerson = recipe.doctor?.commonPerson;
  const doctorName = `Dr(a). ${fullName(doctorPerson)}`;
  const specialty =
    recipe.medicalHistory?.specialty?.name ||
    recipe.doctor?.specialties?.[0]?.name ||
    'Medicina General';
  const center = recipe.medicalHistory?.medicalCenter;
  const items = [...(recipe.items ?? [])].sort(
    (a, b) => (a.orderNumber ?? 0) - (b.orderNumber ?? 0),
  );

  const header = (t: string): Content => ({
    text: t,
    bold: true,
    fontSize: 8,
    color: MUTED,
  });
  const rows = items.map((item) => {
    const detail = [item.presentation, item.concentration]
      .map((v) => (v ?? '').trim())
      .filter(Boolean)
      .join(' · ');
    return [
      {
        stack: [
          { text: text(item.medicationName), bold: true },
          ...(detail ? [{ text: detail, fontSize: 8, color: MUTED }] : []),
          ...(item.instructions
            ? [
                {
                  text: item.instructions,
                  fontSize: 8,
                  italics: true,
                  color: '#94a3b8',
                },
              ]
            : []),
        ],
      },
      text(item.dosage),
      text(item.frequency),
      text(item.duration),
      item.quantity
        ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
        : '—',
    ];
  });

  const signatureImage: Content[] = extras.signature
    ? [{ image: extras.signature, fit: [200, 60], margin: [0, 0, 0, 2] }]
    : [];
  const stampColumn: Column[] = extras.stamp
    ? [{ width: 'auto', stack: [{ image: extras.stamp, fit: [90, 90] }], margin: [16, 0, 0, 0] }]
    : [];

  const content: Content[] = [
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: 'RECETA MÉDICA', fontSize: 22, bold: true, color: BLUE },
            {
              text: `NRO: ${text(recipe.recipeNumber)}`,
              fontSize: 10,
              bold: true,
              color: ACCENT,
              margin: [0, 2, 0, 0],
            },
          ],
        },
        {
          width: '*',
          alignment: 'right',
          stack: [
            {
              text: text(center?.name, 'Centro Médico'),
              fontSize: 13,
              bold: true,
            },
            {
              text: text(center?.address, ''),
              fontSize: 8,
              color: MUTED,
              margin: [0, 2, 0, 0],
            },
            {
              text: `Fecha: ${formatDate(recipe.issueDate)}`,
              fontSize: 9,
              bold: true,
              color: '#1d4ed8',
              margin: [0, 6, 0, 0],
            },
          ],
        },
      ],
    },
    {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 6,
          x2: 515,
          y2: 6,
          lineWidth: 2,
          lineColor: ACCENT,
        },
      ],
      margin: [0, 0, 0, 14],
    },
    {
      columns: [
        box(
          'PACIENTE',
          fullName(patientPerson),
          `Documento: ${documentId(patientPerson)}`,
        ),
        box('MÉDICO', doctorName, `Especialidad: ${specialty}`),
      ],
      columnGap: 14,
    },
    ...(recipe.diagnosis
      ? section('DIAGNÓSTICO MÉDICO', recipe.diagnosis, '#0369a1')
      : []),
    {
      text: 'PRESCRIPCIÓN',
      fontSize: 9,
      bold: true,
      color: '#475569',
      margin: [0, 16, 0, 6],
    },
    {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
        body: [
          [
            header('MEDICAMENTO'),
            header('DOSIS'),
            header('FRECUENCIA'),
            header('DURACIÓN'),
            header('CANTIDAD'),
          ],
          ...(rows.length
            ? rows
            : [
                [
                  {
                    text: 'Sin medicamentos registrados',
                    colSpan: 5,
                    italics: true,
                    color: MUTED,
                  },
                  '',
                  '',
                  '',
                  '',
                ],
              ]),
        ],
      },
      layout: 'lightHorizontalLines',
      fontSize: 9,
    },
    ...(recipe.generalInstructions
      ? section(
          'INSTRUCCIONES ADICIONALES',
          recipe.generalInstructions,
          '#92400e',
        )
      : []),
    ...(recipe.notes ? section('NOTAS', recipe.notes, '#475569') : []),
    {
      margin: [0, extras.signature ? 24 : 50, 0, 0],
      columns: [
        {
          width: 'auto',
          stack: [
            ...signatureImage,
            {
              canvas: [
                {
                  type: 'line',
                  x1: 0,
                  y1: 0,
                  x2: 200,
                  y2: 0,
                  lineWidth: 1,
                  lineColor: '#1e293b',
                },
              ],
            },
            {
              text: doctorName,
              bold: true,
              fontSize: 10,
              margin: [0, 4, 0, 0],
            },
            { text: 'FIRMA Y SELLO MÉDICO', fontSize: 7, color: '#94a3b8' },
          ],
        },
        ...stampColumn,
        {
          width: '*',
          alignment: 'right',
          fontSize: 7,
          color: '#94a3b8',
          stack: [
            `Fecha de impresión: ${formatDate(printedAt, true)}`,
            `ID Gestión: ${recipe.id.slice(0, 8)}`,
          ],
        },
      ],
    },
    ...(extras.verificationUrl && recipe.verificationCode
      ? [verificationBlock(extras.verificationUrl)]
      : []),
  ];

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    info: {
      title: `Receta ${text(recipe.recipeNumber, recipe.id)}`,
      author: text(center?.name, 'Centro Médico'),
    },
    defaultStyle: { font: 'Helvetica', fontSize: 10, color: '#1e293b' },
    content,
  };
}

/** QR to the public verify page plus a masked link to it; neither the URL nor the code is printed as text. */
function verificationBlock(url: string): Content {
  return {
    margin: [0, 18, 0, 0],
    columnGap: 12,
    columns: [
      { width: 'auto', qr: url, fit: 80 },
      {
        width: '*',
        fontSize: 8,
        color: MUTED,
        margin: [0, 10, 0, 0],
        stack: [
          { text: VERIFY_LEGEND, bold: true, color: '#1e293b' },
          {
            text: VERIFY_LINK_TEXT,
            color: ACCENT,
            decoration: 'underline',
            link: url,
            margin: [0, 3, 0, 0],
          },
        ],
      },
    ],
  };
}

export function renderPdf(definition: TDocumentDefinitions): Promise<Buffer> {
  return pdfmake.createPdf(definition).getBuffer();
}
