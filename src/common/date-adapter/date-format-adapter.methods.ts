import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function IsDateStringCustom(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isDateStringCustom',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          // dd/mm/yyyy o dd-mm-yyyy
          return /^(\d{2})[\/-](\d{2})[\/-](\d{4})$/.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} debe estar en formato dd/mm/yyyy o dd-mm-yyyy`;
        },
      },
    });
  };
}

/**
 * Normaliza a YYYY-MM-DD.
 * Si año viene con 2 dígitos (dd/mm/yy) se antepone 20 -> dd/mm/20yy.
 * Si no cumple patrón intenta Date().
 */
export function toValidDate(date: Date | string): string {
  let year: string, month: string, day: string;

  if (typeof date === 'string') {
    const raw = date.trim();

    // Patron principal (incluye año 2 o 4 dígitos)
    const main = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{2}|\d{4})$/);
    if (main) {
      day = main[1];
      month = main[2];
      const y = main[3];
      year = y.length === 2 ? `20${y}` : y;
    } else {
      // Split manual por '/' primero, luego '-'
      let parts: string[] = [];
      if (raw.includes('/')) parts = raw.split('/');
      else if (raw.includes('-')) parts = raw.split('-');

      if (parts.length === 3) {
        const [d, m, y] = parts;
        if (/^\d{2}$/.test(d) && /^\d{2}$/.test(m) && /^\d{2,4}$/.test(y)) {
          day = d;
          month = m;
          year = y.length === 2 ? `20${y}` : y;
        } else {
          // Fallback a Date() si no cumple
          const dt = new Date(raw);
          if (isNaN(dt.getTime())) throw new Error('Formato de fecha inválido');
          year = dt.getFullYear().toString();
          month = String(dt.getMonth() + 1).padStart(2, '0');
          day = String(dt.getDate()).padStart(2, '0');
        }
      } else {
        const dt = new Date(raw);
        if (isNaN(dt.getTime())) throw new Error('Formato de fecha inválido');
        year = dt.getFullYear().toString();
        month = String(dt.getMonth() + 1).padStart(2, '0');
        day = String(dt.getDate()).padStart(2, '0');
      }
    }
  } else {
    year = date.getFullYear().toString();
    month = String(date.getMonth() + 1).padStart(2, '0');
    day = String(date.getDate()).padStart(2, '0');
  }

  return `${year}-${month}-${day}`;
}

/**
 * Convierte entradas de fecha reducida (MMYY, YYMM, YYYYMM, MMYYYY, con o sin separadores)
 * al primer día del mes en formato ISO YYYY-MM-01.
 * Reglas:
 *  - Años de 2 dígitos: 00-69 => 2000-2069, 70-99 => 1970-1999 (ajusta si necesitas otro rango).
 *  - Si no se puede determinar mes/año válidos retorna ''.
 * Ejemplos:
 *  - '0925' (MMYY)        => 2025-09-01
 *  - '2509' (YYMM)        => 2025-09-01
 *  - '202509' (YYYYMM)    => 2025-09-01
 *  - '092025' (MMYYYY)    => 2025-09-01
 *  - '09/25' (MM/YY)      => 2025-09-01
 *  - '25/09' (YY/MM) (*)  => 2025-09-01 (si segunda parte es 1..12 se toma como mes)
 */
export function formatYYMM(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');

  const toFourDigitYear = (yy: number): number =>
    yy < 70 ? 2000 + yy : 1900 + yy;

  let year: number | null = null;
  let month: number | null = null;

  if (/^\d{4}$/.test(digits)) {
    // Ambiguo: MMYY o YYMM
    const a = parseInt(digits.substring(0, 2), 10);
    const b = parseInt(digits.substring(2, 4), 10);
    // Caso claro MMYY
    if (a >= 1 && a <= 12) {
      month = a;
      year = toFourDigitYear(b);
    }
    // Caso claro YYMM
    if (
      (year === null || month === null) &&
      b >= 1 &&
      b <= 12 &&
      !(a >= 1 && a <= 12 && b >= 1 && b <= 12)
    ) {
      month = b;
      year = toFourDigitYear(a);
    }
    // Si ambos parecen meses (ej: 0312) preferimos MMYY (03=mes, 12=año 2012)
    if (year === null || month === null) {
      if (a >= 1 && a <= 12 && b >= 0 && b <= 99) {
        month = a;
        year = toFourDigitYear(b);
      }
    }
  } else if (/^\d{6}$/.test(digits)) {
    // Puede ser YYYYMM o MMYYYY
    const first4 = parseInt(digits.substring(0, 4), 10);
    const last2 = parseInt(digits.substring(4, 6), 10);
    const first2 = parseInt(digits.substring(0, 2), 10);
    const last4 = parseInt(digits.substring(2, 6), 10);

    // YYYYMM
    if (first4 > 1900 && last2 >= 1 && last2 <= 12) {
      year = first4;
      month = last2;
    } else if (first2 >= 1 && first2 <= 12 && last4 > 1900) {
      // MMYYYY
      year = last4;
      month = first2;
    }
  } else if (/^\d{2}\/\d{2}$/.test(raw) || /^\d{2}-\d{2}$/.test(raw)) {
    // Formato con separador MM/YY ó YY/MM (heurística: si primera parte >12 => YY/MM)
    const parts = raw.split(/[\/-]/);
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    if (p1 > 12 && p2 >= 1 && p2 <= 12) {
      // YY/MM
      year = toFourDigitYear(p1);
      month = p2;
    } else {
      // MM/YY
      if (p1 >= 1 && p1 <= 12) {
        month = p1;
        year = toFourDigitYear(p2);
      }
    }
  }

  if (year === null || month === null || month < 1 || month > 12) return '';

  return `${year}-${String(month).padStart(2, '0')}-01`;
}
