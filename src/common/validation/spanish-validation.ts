import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';

/** Number(s) inside a class-validator default message, e.g. "shorter than or equal to 500 characters". */
const numbers = (message: string): number[] => (message.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
const last = (message: string): number | undefined => numbers(message).pop();
const chars = (n: number | undefined) => `${n} ${n === 1 ? 'carácter' : 'caracteres'}`;
const allowedValues = (message: string) => message.split(':').slice(1).join(':').trim();

type Translate = (field: string, message: string) => string;

const TRANSLATIONS: Record<string, Translate> = {
  whitelistValidation: (f) => `La propiedad ${f} no está permitida.`,
  isDefined: (f) => `${f} es obligatorio.`,
  isNotEmpty: (f) => `${f} no debe estar vacío.`,
  isEmpty: (f) => `${f} debe estar vacío.`,
  isUuid: (f) => `${f} debe ser un UUID válido.`,
  isString: (f) => `${f} debe ser un texto.`,
  isEmail: (f) => `${f} debe ser un correo electrónico válido.`,
  isUrl: (f) => `${f} debe ser una URL válida.`,
  isDateString: (f) => `${f} debe ser una fecha válida (ISO 8601).`,
  isIso8601: (f) => `${f} debe ser una fecha válida (ISO 8601).`,
  isDate: (f) => `${f} debe ser una fecha válida.`,
  isMilitaryTime: (f) => `${f} debe ser una hora válida (HH:MM).`,
  matches: (f) => `${f} no tiene un formato válido.`,
  maxLength: (f, m) => `${f} no debe superar ${chars(last(m))}.`,
  minLength: (f, m) => `${f} debe tener al menos ${chars(last(m))}.`,
  isLength: (f, m) => {
    if (m.includes('longer') && m.includes('shorter')) {
      const [min, max] = numbers(m);
      return min === max ? `${f} debe tener exactamente ${chars(min)}.` : `${f} debe tener entre ${min} y ${chars(max)}.`;
    }
    return m.includes('shorter')
      ? `${f} no debe superar ${chars(last(m))}.`
      : `${f} debe tener al menos ${chars(last(m))}.`;
  },
  isEnum: (f, m) => `${f} debe ser uno de los siguientes valores: ${allowedValues(m)}.`,
  isIn: (f, m) => `${f} debe ser uno de los siguientes valores: ${allowedValues(m)}.`,
  isInt: (f) => `${f} debe ser un número entero.`,
  isNumber: (f) => `${f} debe ser un número.`,
  isNumberString: (f) => `${f} debe ser un número.`,
  isPositive: (f) => `${f} debe ser un número positivo.`,
  min: (f, m) => `${f} no debe ser menor que ${last(m)}.`,
  max: (f, m) => `${f} no debe ser mayor que ${last(m)}.`,
  isBoolean: (f) => `${f} debe ser verdadero o falso.`,
  isArray: (f) => `${f} debe ser una lista.`,
  arrayNotEmpty: (f) => `${f} no debe ser una lista vacía.`,
  arrayMinSize: (f, m) => `${f} debe tener al menos ${last(m)} elemento(s).`,
  arrayMaxSize: (f, m) => `${f} no debe tener más de ${last(m)} elemento(s).`,
  arrayUnique: (f) => `${f} no debe tener elementos repetidos.`,
  isObject: (f) => `${f} debe ser un objeto.`,
  nestedValidation: (f) => `${f} debe ser un objeto válido.`,
  isPhoneNumber: (f) => `${f} debe ser un número de teléfono válido.`,
};

/** A class-validator default (or a custom one in the same English shape): it starts with the field and says must/should. */
function isEnglishDefault(property: string, message: string): boolean {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(each value in |nested property |property |an instance of \\w+ )?${escaped}\\b.*\\b(must|should|has to)\\b`, 'i').test(
    message,
  );
}

/** Translates one constraint; a message already written in Spanish by the DTO is kept as is. */
export function translateConstraint(path: string, property: string, key: string, message: string): string {
  if (!isEnglishDefault(property, message)) return message;
  const field = message.startsWith('each value in ') ? `cada valor de ${path}` : path;
  const translate = TRANSLATIONS[key];
  return translate ? translate(field, message) : `${field} no es válido.`;
}

/** Flattens the error tree into Spanish messages, naming nested fields by their full path (e.g. "newPatientData.email"). */
export function spanishValidationMessages(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(([key, message]) =>
      translateConstraint(path, error.property, key, message),
    );
    return [...own, ...spanishValidationMessages(error.children ?? [], path)];
  });
}

/** `exceptionFactory` of the global ValidationPipe: same 400 body as Nest's default, with Spanish messages. */
export const spanishValidationExceptionFactory = (errors: ValidationError[]) =>
  new BadRequestException(spanishValidationMessages(errors));

/** The global pipe registered as APP_PIPE; tests build it from here to exercise the real configuration. */
export const createAppValidationPipe = () =>
  new ValidationPipe({ transform: true, whitelist: true, exceptionFactory: spanishValidationExceptionFactory });
