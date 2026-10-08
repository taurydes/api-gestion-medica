import { createHash } from 'crypto';
import type { Column, Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import {
  FrameSpec,
  frame,
  group,
  marker,
  renderFramedPdf,
} from './recipe-pdf.frames';
import {
  CARD_PAD,
  CARD_RADIUS,
  PillStyle,
  TILE,
  caption,
  card,
  divider,
  pill,
  qrSize,
  sectionTitle,
  tile,
} from './recipe-pdf.parts';
import {
  COLOR,
  FONT,
  ICON,
  MONO,
  asclepiusSvg,
  lineHeight,
  textWidth,
} from './recipe-pdf.theme';

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
    licenseNumber?: string | null;
    specialties?: Array<{ name: string }> | null;
  } | null;
  medicalHistory?: {
    medicalCenter?: {
      name?: string | null;
      address?: string | null;
      phone?: string | null;
    } | null;
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
    route?: string | null;
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

export const VERIFY_LEGEND = 'Verifique la autenticidad de esta receta';
export const VERIFY_HINT = 'Escanee el código QR o ';
export const VERIFY_LINK_TEXT = 'haga clic aquí para verificarla';
// Bump when the printed layout changes, so PDFs cached under the old layout regenerate.
const LAYOUT_VERSION = 3;

export interface PersonName {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  secondLastName?: string | null;
  letter?: string | null;
  documentNumber?: string | null;
  sex?: string | null;
}

const TIME_ZONE = 'America/Caracas';
const ITEM_WIDTHS = [64, 84, 58, 56];
const PAGE = {
  width: 595.28,
  height: 841.89,
  margins: [40, 40, 40, 62] as [number, number, number, number],
};
const CONTENT_WIDTH = PAGE.width - PAGE.margins[0] - PAGE.margins[2];
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

const SEX_LABEL: Record<string, string> = { F: 'Femenino', M: 'Masculino' };

/** sha256 of every value the PDF prints (print date aside): the cache key of the generated file. */
export function recipePdfFingerprint(
  recipe: RecipePdfData,
  extras: RecipePdfExtras = {},
): string {
  const digest = (value?: string | null) =>
    value ? createHash('sha256').update(value).digest('hex') : null;
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
    patientSex: recipe.patient?.commonPerson?.sex ?? null,
    doctor: person(recipe.doctor?.commonPerson),
    doctorLicense: recipe.doctor?.licenseNumber ?? null,
    doctorSpecialties: (recipe.doctor?.specialties ?? []).map((s) => s.name),
    specialty: recipe.medicalHistory?.specialty?.name ?? null,
    center: [
      recipe.medicalHistory?.medicalCenter?.name ?? null,
      recipe.medicalHistory?.medicalCenter?.address ?? null,
      recipe.medicalHistory?.medicalCenter?.phone ?? null,
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
        i.route ?? null,
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
  const centerName = text(center?.name, 'Centro Médico');
  const items = [...(recipe.items ?? [])].sort(
    (a, b) => (a.orderNumber ?? 0) - (b.orderNumber ?? 0),
  );

  const content: Content[] = [
    header(recipe, centerName, center?.address, center?.phone),
    divider(CONTENT_WIDTH, [0, 12, 0, 14]),
    group('people', [
      {
        columns: [
          {
            width: '*',
            stack: card(
              'people',
              (CONTENT_WIDTH - 12) / 2,
              patientCard(patientPerson),
            ),
          },
          {
            width: '*',
            stack: card(
              'people',
              (CONTENT_WIDTH - 12) / 2,
              doctorCard(doctorName, specialty, recipe.doctor?.licenseNumber),
              1,
            ),
          },
        ],
        columnGap: 12,
      },
    ]),
    ...(recipe.diagnosis
      ? [
          group(
            'diagnosis',
            card('diagnosis', CONTENT_WIDTH, diagnosisBody(recipe.diagnosis)),
            [0, 12, 0, 0],
          ),
        ]
      : []),
    ...prescription(items),
    ...notesCard(recipe.generalInstructions, recipe.notes),
    group(
      'closing',
      [
        marker('spacer:closing'),
        {
          columns: [
            { width: '*', stack: signatureBlock(doctorName, extras) },
            ...(extras.verificationUrl && recipe.verificationCode
              ? [verificationBlock(extras.verificationUrl)]
              : []),
          ],
          columnGap: 20,
        },
      ],
      [0, 18, 0, 0],
    ),
  ];

  return {
    pageSize: 'A4',
    pageMargins: PAGE.margins,
    info: {
      title: `Receta ${text(recipe.recipeNumber, recipe.id)}`,
      author: centerName,
    },
    defaultStyle: {
      font: FONT,
      fontSize: 9,
      color: COLOR.slate900,
      lineHeight: 1.15,
    },
    background: background(),
    footer: footer(printedAt, recipe.id, centerName),
    content,
  };
}

function header(
  recipe: RecipePdfData,
  centerName: string,
  address?: string | null,
  phone?: string | null,
): Content {
  const number = pill(`NRO: ${text(recipe.recipeNumber)}`, {
    size: 8,
    font: MONO,
    color: COLOR.teal700,
    fill: COLOR.teal50,
    border: COLOR.teal200,
    padX: 6,
  });
  const initial = centerName.charAt(0).toUpperCase();
  const initialSize = 20;
  const contact = text(phone, '');
  return {
    columns: [
      {
        width: '*',
        stack: [
          {
            columns: [
              pill('DOCUMENTO OFICIAL DE PRESCRIPCIÓN', {
                size: 6.5,
                color: COLOR.teal700,
                fill: COLOR.teal50,
                border: COLOR.teal200,
                spacing: 0.8,
                padX: 8,
                padY: 3,
              }),
              { width: '*', text: '' },
            ],
          },
          {
            text: 'INFORME MÉDICO',
            fontSize: 25,
            bold: true,
            color: COLOR.slate900,
            characterSpacing: -0.3,
            margin: [0, 7, 0, 6],
          },
          {
            columns: [
              number,
              {
                width: '*',
                text: `|   Fecha de emisión: ${formatDate(recipe.issueDate)}`,
                fontSize: 8.5,
                color: COLOR.slate500,
                margin: [8, 3.5, 0, 0],
              },
            ],
          },
        ],
      },
      {
        width: 220,
        stack: [
          {
            columns: [
              {
                width: '*',
                text: centerName,
                fontSize: 12,
                bold: true,
                color: COLOR.slate900,
                alignment: 'right',
                margin: [0, 4, 0, 0],
              },
              {
                width: initialSize,
                stack: [
                  {
                    relativePosition: { x: 0, y: 0 },
                    canvas: [
                      {
                        type: 'rect',
                        x: 0,
                        y: 0,
                        w: initialSize,
                        h: initialSize,
                        r: 5,
                        color: COLOR.teal,
                      },
                    ],
                  },
                  {
                    text: initial,
                    fontSize: 11,
                    bold: true,
                    color: COLOR.white,
                    alignment: 'center',
                    lineHeight: 1,
                    margin: [
                      0,
                      (initialSize - lineHeight(11, true)) / 2 + 1,
                      0,
                      0,
                    ],
                  },
                ],
              },
            ],
            columnGap: 8,
          },
          ...(address?.trim()
            ? [
                {
                  text: address.trim(),
                  fontSize: 8,
                  color: COLOR.slate500,
                  alignment: 'right' as const,
                  margin: [0, 5, initialSize + 8, 0] as [
                    number,
                    number,
                    number,
                    number,
                  ],
                },
              ]
            : []),
          ...(contact
            ? [
                {
                  text: `Tel: ${contact}`,
                  fontSize: 7.5,
                  color: COLOR.slate400,
                  alignment: 'right' as const,
                  margin: [0, 2, initialSize + 8, 0] as [
                    number,
                    number,
                    number,
                    number,
                  ],
                },
              ]
            : []),
        ],
      },
    ],
  };
}

function patientCard(person?: PersonName | null): Content {
  const sex = person?.sex ? SEX_LABEL[person.sex] : undefined;
  return {
    columns: [
      tile(ICON.patient(COLOR.teal), COLOR.teal50),
      {
        width: '*',
        stack: [
          caption('INFORMACIÓN DEL PACIENTE'),
          {
            text: fullName(person),
            fontSize: 11,
            bold: true,
            margin: [0, 4, 0, 0],
          },
          {
            text: `Documento: ${documentId(person)}`,
            fontSize: 8,
            color: COLOR.slate500,
            margin: [0, 3, 0, 0],
          },
          ...(sex
            ? [
                {
                  text: `Sexo: ${sex}`,
                  fontSize: 8,
                  color: COLOR.slate500,
                  margin: [0, 1.5, 0, 0] as [number, number, number, number],
                },
              ]
            : []),
        ],
      },
    ],
    columnGap: 10,
  };
}

function doctorCard(
  doctorName: string,
  specialty: string,
  license?: string | null,
): Content {
  const tag: PillStyle = {
    size: 7,
    color: COLOR.primary800,
    fill: COLOR.primary50,
    padX: 6,
    padY: 2.5,
  };
  // Card text column: half the content width minus padding, tile and gap.
  const room = (CONTENT_WIDTH - 12) / 2 - CARD_PAD * 2 - TILE - 10;
  const fits = textWidth(specialty, tag.size, true) + 12 <= room;
  return {
    columns: [
      tile(ICON.doctor(COLOR.primary), COLOR.primary50),
      {
        width: '*',
        stack: [
          caption('MÉDICO ESPECIALISTA'),
          { text: doctorName, fontSize: 11, bold: true, margin: [0, 4, 0, 0] },
          fits
            ? {
                columns: [pill(specialty, tag), { width: '*', text: '' }],
                margin: [0, 4, 0, 0],
              }
            : {
                text: specialty,
                fontSize: 8,
                bold: true,
                color: COLOR.primary800,
                margin: [0, 3, 0, 0],
              },
          ...(license?.trim()
            ? [
                {
                  text: `Licencia: ${license.trim()}`,
                  fontSize: 8,
                  color: COLOR.slate500,
                  margin: [0, 3, 0, 0] as [number, number, number, number],
                },
              ]
            : []),
        ],
      },
    ],
    columnGap: 10,
  };
}

function diagnosisBody(diagnosis: string): Content {
  return {
    columns: [
      tile(ICON.diagnosis(COLOR.teal), COLOR.teal50),
      {
        width: '*',
        stack: [
          caption('DIAGNÓSTICO MÉDICO PRIMARIO'),
          { text: diagnosis, fontSize: 11, bold: true, margin: [0, 4, 0, 0] },
        ],
      },
    ],
    columnGap: 10,
  };
}

type Item = NonNullable<RecipePdfData['items']>[number];

/** "Oral" when every item shares one route; null when routes are missing or mixed. */
function sharedRoute(items: Item[]): string | null {
  const routes = items.map((i) => (i.route ?? '').trim());
  if (!routes.length || routes.some((r) => !r)) return null;
  const first = routes[0].toLowerCase();
  if (!routes.every((r) => r.toLowerCase() === first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function prescription(items: Item[]): Content[] {
  const route = sharedRoute(items);
  const head = (t: string): Content => ({
    text: t,
    fontSize: 6.5,
    bold: true,
    color: COLOR.slate500,
    characterSpacing: 0.6,
  });
  const band = marker('band:items');
  const rows = items.map((item, index) => {
    const detail = [
      item.presentation,
      item.concentration,
      route ? null : item.route ? `Vía ${item.route.trim()}` : null,
    ]
      .map((v) => (v ?? '').trim())
      .filter(Boolean)
      .join(' · ');
    const frequency = text(item.frequency);
    const freqPill: PillStyle = {
      size: 7.5,
      color: COLOR.teal700,
      fill: COLOR.teal50,
      padX: 6,
      padY: 2.5,
    };
    const pillFits =
      textWidth(frequency, freqPill.size, true) + 12 <= ITEM_WIDTHS[1];
    return [
      {
        stack: [
          ...(index === 0 ? [band] : []),
          { text: text(item.medicationName), bold: true, fontSize: 9.5 },
          ...(detail
            ? [
                {
                  text: detail,
                  fontSize: 7.5,
                  color: COLOR.slate500,
                  margin: [0, 1.5, 0, 0] as [number, number, number, number],
                },
              ]
            : []),
          ...(item.instructions?.trim()
            ? [
                {
                  columns: [
                    {
                      width: 7,
                      svg: ICON.info(COLOR.rose600),
                      height: 7,
                      margin: [0, 1, 0, 0] as [number, number, number, number],
                    },
                    {
                      width: '*',
                      text: item.instructions.trim(),
                      fontSize: 7.5,
                      italics: true,
                      color: COLOR.rose600,
                    },
                  ],
                  columnGap: 4,
                  margin: [0, 3, 0, 0] as [number, number, number, number],
                },
              ]
            : []),
        ],
      },
      { text: text(item.dosage), fontSize: 8.5, color: COLOR.slate700 },
      pillFits
        ? { columns: [pill(frequency, freqPill), { width: '*', text: '' }] }
        : { text: frequency, fontSize: 8, bold: true, color: COLOR.teal700 },
      { text: text(item.duration), fontSize: 8.5, color: COLOR.slate700 },
      item.quantity
        ? {
            text: [
              { text: String(item.quantity), bold: true, fontSize: 9.5 },
              ...(item.unit?.trim()
                ? [
                    {
                      text: ` ${item.unit.trim()}`,
                      fontSize: 7.5,
                      color: COLOR.slate500,
                    },
                  ]
                : []),
            ],
          }
        : { text: '—', color: COLOR.slate500 },
    ] as Content[];
  });
  const empty: Content[] = [
    {
      stack: [
        band,
        {
          text: 'Sin medicamentos registrados',
          italics: true,
          color: COLOR.slate500,
        },
      ],
      colSpan: 5,
    } as Content,
    '',
    '',
    '',
    '',
  ];

  const spec: FrameSpec = {
    group: 'items',
    width: CONTENT_WIDTH,
    radius: CARD_RADIUS,
    fill: COLOR.white,
    stroke: COLOR.slate200,
    band: { marker: 'band:items', fill: COLOR.slate100, inset: 0 },
    fallbackLayout: 'recipeItemsFallback',
  };
  return [
    sectionTitle(
      ICON.pills(COLOR.teal),
      'PRESCRIPCIÓN / INDICACIÓN FARMACOLÓGICA',
      route ? `Rp. Vía ${route}` : undefined,
      [0, 16, 0, 8],
    ),
    group('items', [
      frame(spec),
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: ['*', ...ITEM_WIDTHS],
          body: [
            [
              head('MEDICAMENTO & ESPECIFICACIÓN'),
              head('DOSIS'),
              head('FRECUENCIA'),
              head('DURACIÓN'),
              head('CANTIDAD'),
            ],
            ...(rows.length ? rows : [empty]),
          ],
        },
        layout: 'recipeItems',
      },
    ]),
  ];
}

function notesCard(
  instructions?: string | null,
  notes?: string | null,
): Content[] {
  const paragraphs = [instructions, notes]
    .map((v) => (v ?? '').trim())
    .filter(Boolean);
  if (!paragraphs.length) return [];
  const body: Content = {
    stack: [
      sectionTitle(ICON.notes(COLOR.teal), 'NOTAS E INSTRUCCIONES GENERALES'),
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: paragraphs.map((p, i) => ({
                  text: p,
                  fontSize: 9,
                  color: COLOR.slate700,
                  lineHeight: 1.25,
                  margin: [0, i ? 4 : 0, 0, 0] as [
                    number,
                    number,
                    number,
                    number,
                  ],
                })),
              },
            ],
          ],
        },
        layout: 'recipeNoteBar',
        margin: [0, 8, 0, 0],
      },
    ],
  };
  return [group('notes', card('notes', CONTENT_WIDTH, body), [0, 14, 0, 0])];
}

function signatureBlock(
  doctorName: string,
  extras: RecipePdfExtras,
): Content[] {
  // Side by side, never stacked: signature and stamp must not overlap the name below.
  const image = (data: string, fit: [number, number]): Column => ({
    width: 'auto',
    stack: [{ image: data, fit }],
  });
  const images: Column[] = [];
  if (extras.signature) images.push(image(extras.signature, [150, 52]));
  if (extras.stamp) images.push(image(extras.stamp, [62, 62]));
  return [
    images.length
      ? { columns: images, columnGap: 12, margin: [0, 0, 0, 4] }
      : { text: '', margin: [0, 44, 0, 0] },
    {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: 210,
          y2: 0,
          lineWidth: 0.9,
          lineColor: COLOR.slate400,
        },
      ],
    },
    {
      text: doctorName.toLocaleUpperCase('es'),
      bold: true,
      fontSize: 9,
      margin: [0, 5, 0, 0],
    },
    {
      ...(caption('FIRMA Y SELLO MÉDICO DIGITAL') as object),
      margin: [0, 2, 0, 0],
    } as Content,
  ];
}

const QR_CARD = { width: 250, pad: 10, tile: 86, qr: 80 };

/** QR to the public verify page plus a masked link to it; neither the URL nor the code is printed as text. */
function verificationBlock(url: string): Column {
  const { width, pad, tile: size, qr } = QR_CARD;
  const inset = (size - qrSize(url, qr)) / 2;
  const box = { group: 'qr', radius: CARD_RADIUS, stroke: COLOR.slate200 };
  return {
    width,
    ...(group('qr', [
      frame({ ...box, width, height: size + pad * 2, fill: COLOR.slate50 }),
      frame({
        ...box,
        slot: 1,
        width: size,
        height: size,
        radius: 6,
        fill: COLOR.white,
        offset: { x: pad, y: pad },
      }),
      {
        columns: [
          {
            width: size,
            qr: url,
            fit: qr,
            margin: [inset, inset, inset, inset],
            foreground: COLOR.slate900,
          },
          {
            width: '*',
            margin: [0, 20, 0, 0],
            stack: [
              {
                text: VERIFY_LEGEND,
                bold: true,
                fontSize: 8.5,
                color: COLOR.slate900,
                lineHeight: 1.1,
              },
              {
                text: [
                  VERIFY_HINT,
                  {
                    text: VERIFY_LINK_TEXT,
                    color: COLOR.teal700,
                    decoration: 'underline',
                    link: url,
                  },
                ],
                fontSize: 7.5,
                color: COLOR.slate500,
                lineHeight: 1.2,
                margin: [0, 4, 0, 0],
              },
            ],
          },
        ],
        columnGap: 12,
        margin: [pad, pad, pad, pad],
      },
    ]) as { stack: Content[] }),
  };
}

function background(): Content {
  const mark = { width: 230, height: 276 };
  return [
    {
      absolutePosition: { x: 0, y: 0 },
      canvas: [
        {
          type: 'rect',
          x: 0,
          y: 0,
          w: PAGE.width,
          h: 5,
          linearGradient: [COLOR.teal, COLOR.primary, COLOR.emerald],
        } as never,
      ],
    },
    {
      absolutePosition: {
        x: (PAGE.width - mark.width) / 2,
        y: (PAGE.height - mark.height) / 2,
      },
      svg: asclepiusSvg(COLOR.slate900, 0.025),
      width: mark.width,
      height: mark.height,
    },
  ];
}

function footer(printedAt: Date, id: string, centerName: string): Content {
  return {
    margin: [PAGE.margins[0], 22, PAGE.margins[2], 0],
    stack: [
      divider(CONTENT_WIDTH, [0, 0, 0, 0]),
      {
        columns: [
          {
            width: '*',
            text: `Fecha de impresión: ${formatDate(printedAt, true)}`,
          },
          { width: 'auto', text: `ID Gestión: ${id.slice(0, 8)}` },
          { width: '*', text: `${centerName} • VIBE`, alignment: 'right' },
        ],
        columnGap: 12,
        fontSize: 7,
        color: COLOR.slate400,
        margin: [0, 7, 0, 0],
      },
    ],
  };
}

export function renderPdf(definition: TDocumentDefinitions): Promise<Buffer> {
  return renderFramedPdf(definition);
}
