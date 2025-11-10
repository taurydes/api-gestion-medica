import * as moment from 'moment';
import { DateAdapter } from './date-adapter-base';
import { toValidDate } from './date-format-adapter.methods';

/**
 * Implementación de DateAdapter usando Moment.js.
 *
 * Proporciona métodos para manipular, comparar y formatear fechas
 * basándose en la librería moment.
 */
export class MomentAdapter extends DateAdapter {
  private _moment: moment.Moment;

  constructor(
    date?: string | Date | moment.Moment,
    format?: string,
    strict: boolean = false,
  ) {
    super();
    this._moment =
      typeof date === 'string' && format
        ? moment(date, format, strict)
        : moment(date);
  }

  /**
   * Crea una nueva instancia de MomentAdapter a partir de distintos tipos de fecha.
   */
  static create(
    rawDate?: string | Date | moment.Moment,
    format?: string,
    strict: boolean = false,
  ): MomentAdapter {
    let date: string | Date | moment.Moment = rawDate as any;
    if (typeof rawDate === 'string') {
      // Si trae fecha completa con hora, mantener formato
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawDate)) {
        return new MomentAdapter(
          rawDate,
          format || 'YYYY-MM-DD HH:mm:ss',
          true,
        );
      }
      // Normaliza fechas simples
      date = toValidDate(rawDate);
    }
    return new MomentAdapter(date, format, strict);
  }

  /** Retorna la fecha actual. */
  now(): MomentAdapter {
    return new MomentAdapter(moment());
  }

  /** Suma una cantidad de tiempo en la unidad indicada. */
  add(amount: number, unit: string): MomentAdapter {
    return new MomentAdapter(
      this._moment
        .clone()
        .add(amount, unit as moment.unitOfTime.DurationConstructor),
    );
  }

  /** Resta una cantidad de tiempo en la unidad indicada. */
  subtract(amount: number, unit: string): MomentAdapter {
    return new MomentAdapter(
      this._moment
        .clone()
        .subtract(amount, unit as moment.unitOfTime.DurationConstructor),
    );
  }

  /** Devuelve la fecha formateada según el patrón dado. */
  format(formatStr: string): string {
    return this._moment.format(formatStr);
  }

  /** Retorna true si la fecha actual es anterior a la comparada. */
  isBefore(date: MomentAdapter | string): boolean {
    const compare =
      typeof date === 'string' ? moment(date) : (date as MomentAdapter)._moment;
    return this._moment.isBefore(compare);
  }

  /** Retorna true si la fecha actual es posterior a la comparada. */
  isAfter(date: MomentAdapter | string): boolean {
    const compare =
      typeof date === 'string' ? moment(date) : (date as MomentAdapter)._moment;
    return this._moment.isAfter(compare);
  }

  /** Retorna true si ambas fechas son iguales, opcionalmente por unidad. */
  isSame(date: MomentAdapter | string, unit?: string): boolean {
    const compare =
      typeof date === 'string' ? moment(date) : (date as MomentAdapter)._moment;
    return this._moment.isSame(compare, unit as moment.unitOfTime.StartOf);
  }

  /** Calcula la diferencia entre fechas según la unidad indicada. */
  diff(date: MomentAdapter | string, unit?: string, precise?: boolean): number {
    const compare =
      typeof date === 'string' ? moment(date) : (date as MomentAdapter)._moment;
    return this._moment.diff(compare, unit as moment.unitOfTime.Diff, precise);
  }

  /** Convierte a un objeto Date nativo. */
  toDate(): Date {
    return this._moment.toDate();
  }

  /** Retorna una copia exacta del adaptador. */
  clone(): MomentAdapter {
    return new MomentAdapter(this._moment.clone());
  }

  /** Devuelve el valor numérico (timestamp) de la fecha. */
  valueOf(): number {
    return this._moment.valueOf();
  }

  /** Retorna una instancia en formato UTC. */
  utc(): MomentAdapter {
    return new MomentAdapter(this._moment.clone().utc());
  }

  /** Ajusta el idioma o región (locale) del adaptador. */
  locale(locale: string): MomentAdapter {
    return new MomentAdapter(this._moment.clone().locale(locale));
  }

  /** Ajusta la fecha al inicio de la unidad indicada. */
  startOf(unit: string): MomentAdapter {
    return new MomentAdapter(
      this._moment.clone().startOf(unit as moment.unitOfTime.StartOf),
    );
  }

  /** Ajusta la fecha al final de la unidad indicada. */
  endOf(unit: string): MomentAdapter {
    return new MomentAdapter(
      this._moment.clone().endOf(unit as moment.unitOfTime.StartOf),
    );
  }

  /** Indica si la fecha actual es válida. */
  isValid(): boolean {
    return this._moment.isValid();
  }
}
