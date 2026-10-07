// eslint-disable-next-line @typescript-eslint/no-require-imports -- pdfkit is CommonJS; same import as the pdf-kit adapter
import PDFDocument = require('pdfkit');

/** Recipe PDF palette: Tailwind teal/slate plus the frontend's primary and emerald tokens. */
export const COLOR = {
  teal: '#0d9488',
  teal50: '#f0fdfa',
  teal200: '#99f6e4',
  teal700: '#0f766e',
  // Frontend `primary` (tailwind.config.js), the app's indigo.
  primary: '#4f44e9',
  primary50: '#eef2ff',
  primary800: '#3730a3',
  // Frontend `emerald-custom`.
  emerald: '#10b981',
  rose600: '#e11d48',
  white: '#ffffff',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate900: '#0f172a',
} as const;

export const FONT = 'Helvetica';
export const MONO = 'Courier';

// Width measurement only: never written, so it opens no output stream.
const metrics = new PDFDocument({ autoFirstPage: false });

const fontFile = (family: string, bold: boolean): string => {
  if (family === MONO) return bold ? 'Courier-Bold' : 'Courier';
  return bold ? 'Helvetica-Bold' : 'Helvetica';
};

/** Printed width of a single line, with pdfmake's characterSpacing added after every glyph. */
export function textWidth(
  value: string,
  size: number,
  bold = false,
  family = FONT,
  characterSpacing = 0,
): number {
  metrics.font(fontFile(family, bold)).fontSize(size);
  return metrics.widthOfString(value) + characterSpacing * value.length;
}

/** Height pdfmake gives one line of text in the given font and size. */
export function lineHeight(size: number, bold = false, family = FONT): number {
  metrics.font(fontFile(family, bold)).fontSize(size);
  return metrics.currentLineHeight(true);
}

const icon = (color: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${color}" ` +
  `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** Line icons drawn as SVG paths: pdfmake has no icon font. */
export const ICON = {
  patient: (c: string) =>
    icon(
      c,
      '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    ),
  doctor: (c: string) =>
    icon(
      c,
      '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v3a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/>',
    ),
  diagnosis: (c: string) => icon(c, '<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
  pills: (c: string) =>
    icon(
      c,
      '<rect x="2" y="8" width="20" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M9.2 9.2l5.6 5.6"/>',
    ),
  notes: (c: string) =>
    icon(
      c,
      '<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6M9 15h4"/>',
    ),
  info: (c: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="11" fill="${c}"/>` +
    '<path d="M12 11v6" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="7" r="1.6" fill="#ffffff"/></svg>',
};

/** Rod of Asclepius for the background watermark; the opacity keeps it barely visible. */
export function asclepiusSvg(color: string, opacity: number): string {
  const paint = `stroke="${color}" stroke-opacity="${opacity}" fill="none"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">` +
    `<rect x="93" y="22" width="14" height="208" rx="7" fill="${color}" fill-opacity="${opacity}"/>` +
    `<path d="M100 205 C 55 195, 55 168, 100 160 S 145 128, 100 120 S 55 88, 100 80 S 150 52, 122 40" ${paint} ` +
    `stroke-width="11" stroke-linecap="round"/>` +
    `<ellipse cx="124" cy="38" rx="12" ry="8" fill="${color}" fill-opacity="${opacity}"/>` +
    `</svg>`
  );
}
