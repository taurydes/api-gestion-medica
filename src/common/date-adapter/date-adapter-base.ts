/**
 * Clase abstracta: DateAdapter
 *
 * Define la interfaz base para implementar adaptadores de fecha.
 * Sirve como contrato para clases concretas que manejan operaciones
 * sobre fechas (por ejemplo, dayjs, moment, luxon, etc.).
 *
 * Cada método debe devolver una instancia del adaptador o un valor derivado,
 * según corresponda.
 */
export abstract class DateAdapter {
  /** Retorna la fecha actual. */
  abstract now(): DateAdapter;

  /** Suma una cantidad de tiempo según la unidad especificada. */
  abstract add(amount: number, unit: string): DateAdapter;

  /** Resta una cantidad de tiempo según la unidad especificada. */
  abstract subtract(amount: number, unit: string): DateAdapter;

  /** Devuelve la fecha formateada según el patrón dado. */
  abstract format(formatStr: string): string;

  /** Indica si la fecha actual es anterior a la fecha proporcionada. */
  abstract isBefore(date: DateAdapter | string): boolean;

  /** Indica si la fecha actual es posterior a la fecha proporcionada. */
  abstract isAfter(date: DateAdapter | string): boolean;

  /** Indica si las fechas son iguales, opcionalmente comparando por unidad. */
  abstract isSame(date: DateAdapter | string, unit?: string): boolean;

  /** Calcula la diferencia entre dos fechas en la unidad indicada. */
  abstract diff(
    date: DateAdapter | string,
    unit?: string,
    precise?: boolean,
  ): number;

  /** Convierte el adaptador a un objeto Date nativo. */
  abstract toDate(): Date;

  /** Crea una copia del adaptador actual. */
  abstract clone(): DateAdapter;

  /** Devuelve el valor numérico (timestamp) de la fecha. */
  abstract valueOf(): number;

  /** Devuelve una instancia ajustada a UTC. */
  abstract utc(): DateAdapter;

  /** Establece el idioma/región (locale) del adaptador. */
  abstract locale(locale: string): DateAdapter;

  /** Ajusta la fecha al inicio de la unidad especificada (ej. día, mes). */
  abstract startOf(unit: string): DateAdapter;

  /** Ajusta la fecha al final de la unidad especificada (ej. día, mes). */
  abstract endOf(unit: string): DateAdapter;
}
