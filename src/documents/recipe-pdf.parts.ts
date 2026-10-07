import * as pdfmake from 'pdfmake';
import type {
  Column,
  Content,
  ContentColumns,
  ContentTable,
  CustomTableLayout,
  Margins,
} from 'pdfmake/interfaces';
import { FrameSpec, frame } from './recipe-pdf.frames';
import { COLOR, FONT, MONO, lineHeight, textWidth } from './recipe-pdf.theme';

const STANDARD_FONTS = [
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique',
];
pdfmake.setFonts({
  [FONT]: {
    normal: STANDARD_FONTS[0],
    bold: STANDARD_FONTS[1],
    italics: STANDARD_FONTS[2],
    bolditalics: STANDARD_FONTS[3],
  },
  [MONO]: {
    normal: STANDARD_FONTS[4],
    bold: STANDARD_FONTS[5],
    italics: STANDARD_FONTS[6],
    bolditalics: STANDARD_FONTS[7],
  },
});
// Built-in PDF fonts only: no remote URL and no local file can be pulled into a document.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((path) => STANDARD_FONTS.includes(path));

export const CARD_PAD = 12;
export const CARD_RADIUS = 8;
const ROW_PAD = 9;

const none = () => 0;
// Named layouts keep the definition plain JSON, so it can be cloned for the measuring pass.
pdfmake.addTableLayouts({
  recipeCard: {
    hLineWidth: none,
    vLineWidth: none,
    paddingLeft: () => CARD_PAD,
    paddingRight: () => CARD_PAD,
    paddingTop: () => CARD_PAD - 1,
    paddingBottom: () => CARD_PAD - 1,
  },
  recipeCardFallback: {
    hLineWidth: () => 0.75,
    vLineWidth: () => 0.75,
    hLineColor: () => COLOR.slate200,
    vLineColor: () => COLOR.slate200,
    fillColor: () => COLOR.slate50,
    paddingLeft: () => CARD_PAD,
    paddingRight: () => CARD_PAD,
    paddingTop: () => CARD_PAD - 1,
    paddingBottom: () => CARD_PAD - 1,
  },
  recipeItems: itemsLayout(false),
  recipeItemsFallback: itemsLayout(true),
  recipeNoteBar: {
    hLineWidth: none,
    vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
    vLineColor: () => COLOR.teal,
    paddingLeft: () => 10,
    paddingRight: none,
    paddingTop: () => 2,
    paddingBottom: () => 2,
  },
});

/** Prescription table: header band and outer box come from the frame, unless the table splits. */
function itemsLayout(fallback: boolean): CustomTableLayout {
  const columns = (node: ContentTable) => node.table.body[0]?.length ?? 0;
  return {
    hLineWidth: (i, node) =>
      fallback || (i > 0 && i < node.table.body.length) ? 0.75 : 0,
    hLineColor: (i) => (i <= 1 ? COLOR.slate200 : COLOR.slate100),
    vLineWidth: (i, node) =>
      fallback && (i === 0 || i === columns(node)) ? 0.75 : 0,
    vLineColor: () => COLOR.slate200,
    fillColor: (row) => (fallback && row === 0 ? COLOR.slate100 : null),
    paddingLeft: (i) => (i === 0 ? CARD_PAD : 6),
    paddingRight: (i, node) => (i === columns(node) - 1 ? CARD_PAD : 6),
    paddingTop: (row) => (row === 0 ? 8 : ROW_PAD),
    paddingBottom: (row) => (row === 0 ? 7 : ROW_PAD),
  };
}

export interface PillStyle {
  size: number;
  color: string;
  fill: string;
  border?: string;
  font?: string;
  bold?: boolean;
  padX?: number;
  padY?: number;
  spacing?: number;
}

/** Text on a rounded background sized from the font metrics; `width` lets it sit in columns. */
export function pill(value: string, s: PillStyle): Content & { width: number } {
  const padX = s.padX ?? 7;
  const padY = s.padY ?? 3.5;
  const bold = s.bold ?? true;
  // +1: a text exactly as wide as its box wraps in pdfmake.
  const width =
    textWidth(value, s.size, bold, s.font, s.spacing) + padX * 2 + 1;
  const height = lineHeight(s.size, bold, s.font) + padY * 2;
  return {
    width,
    stack: [
      {
        relativePosition: { x: 0, y: 0 },
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 0,
            w: width,
            h: height,
            r: Math.min(5, height / 2),
            color: s.fill,
            ...(s.border ? { lineColor: s.border, lineWidth: 0.6 } : {}),
          },
        ],
      },
      {
        text: value,
        font: s.font ?? FONT,
        fontSize: s.size,
        bold,
        color: s.color,
        characterSpacing: s.spacing ?? 0,
        lineHeight: 1,
        margin: [padX, padY + 0.6, padX, padY - 0.6],
      },
    ],
  };
}

export const TILE = 26;

/** Rounded square with a centered line icon. */
export function tile(svg: string, fill: string): Column {
  const glyph = 14;
  const inset = (TILE - glyph) / 2;
  return {
    width: TILE,
    stack: [
      {
        relativePosition: { x: 0, y: 0 },
        canvas: [
          { type: 'rect', x: 0, y: 0, w: TILE, h: TILE, r: 6, color: fill },
        ],
      },
      {
        svg,
        width: glyph,
        height: glyph,
        margin: [inset, inset, inset, inset],
      },
    ],
  };
}

export const caption = (
  value: string,
  color: string = COLOR.slate400,
): Content => ({
  text: value,
  fontSize: 6.5,
  bold: true,
  color,
  characterSpacing: 0.8,
});

/** Rounded card: measured frame behind a padded single-cell table that flows like normal content. */
export function card(
  key: string,
  width: number,
  body: Content,
  slot = 0,
): Content[] {
  const spec: FrameSpec = {
    group: key,
    slot,
    width,
    radius: CARD_RADIUS,
    fill: COLOR.slate50,
    stroke: COLOR.slate200,
    fallbackLayout: 'recipeCardFallback',
  };
  return [
    frame(spec),
    { table: { widths: ['*'], body: [[body]] }, layout: 'recipeCard' },
  ];
}

export function divider(
  width: number,
  margin: [number, number, number, number],
): Content {
  return {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: width,
        y2: 0,
        lineWidth: 0.75,
        lineColor: COLOR.slate200,
      },
    ],
    margin,
  };
}

export function sectionTitle(
  svg: string,
  title: string,
  right?: string,
  margin?: Margins,
): ContentColumns {
  return {
    columns: [
      { width: 12, svg, height: 12 },
      {
        width: '*',
        text: title,
        fontSize: 8,
        bold: true,
        color: COLOR.slate700,
        characterSpacing: 0.6,
        margin: [0, 2, 0, 0],
      },
      ...(right
        ? [
            {
              width: 'auto' as const,
              text: right,
              fontSize: 8.5,
              italics: true,
              color: COLOR.slate500,
              margin: [0, 1.5, 0, 0] as [number, number, number, number],
            },
          ]
        : []),
    ],
    columnGap: 7,
    ...(margin ? { margin } : {}),
  };
}

/** Printed QR side: pdfmake rounds the module size down, so it is usually smaller than `fit`. */
type QrEncoder = {
  default: { measure(node: object): { _width: number } };
};

export function qrSize(url: string, fit: number): number {
  try {
    // pdfmake does not export its QR encoder; the fallback keeps the PDF working if the path moves.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const qrEnc = require('pdfmake/js/qrEnc') as QrEncoder;
    return qrEnc.default.measure({ qr: url, fit })._width;
  } catch {
    return fit;
  }
}
