import { HttpException } from "@nestjs/common";
import { CustomExceptionOptions, LogsEntities, LogsType } from "src/logs/logs.const";
import { MomentAdapter } from "../date-adapter/date-adapter";

/**
 * Clase base: ExceptionAdapterBase
 *
 * Extiende HttpException para unificar el formato y manejo
 * de excepciones personalizadas con metadatos adicionales.
 * Incluye código, título, datos, entidad destino y tipo de acción.
 */
export abstract class ExceptionAdapterBase extends HttpException {
  public code?: number;
  public entityDestination: LogsEntities;
  public actionId: LogsType;
  public title?: string;
  public data?: any;

  constructor(options: CustomExceptionOptions) {
    super(
      {
        statusCode: options.statusCode,
        message: `${options.message} ${MomentAdapter.create().format('YYYY-MM-DD HH:mm:ss')}`,
        title: options.title,
        data: options.data,
        entityDestination: options.entityDestination,
        actionId: options.actionId,
      },
      options.statusCode,
    );

    this.name = new.target.name;
    this.code = options.code;
    this.entityDestination = options.entityDestination;
    this.title = options.title;
    this.data = options.data;
    this.actionId = options.actionId;
  }

  /** Devuelve el código de estado HTTP. */
  getStatus(): number {
    return this.code ?? 500;
  }

  /** Devuelve la estructura de respuesta estandarizada. */
  getResponse(): CustomExceptionOptions {
    return {
      statusCode: this.getStatus(),
      message: this.message,
      title: this.title,
      data: this.data,
      entityDestination: this.entityDestination,
      actionId: this.actionId,
    };
  }
}

/**
 * Excepciones específicas derivadas del adaptador base.
 */
export class NotFoundExceptionAdapter extends ExceptionAdapterBase {
  constructor(options: CustomExceptionOptions) {
    super({ ...options, code: 404 });
  }
}

export class UnauthorizedExceptionAdapter extends ExceptionAdapterBase {
  constructor(options: CustomExceptionOptions) {
    super({ ...options, code: 401 });
  }
}

export class ForbiddenExceptionAdapter extends ExceptionAdapterBase {
  constructor(options: CustomExceptionOptions) {
    super({ ...options, code: 403 });
  }
}

export class InternalServerExceptionAdapter extends ExceptionAdapterBase {
  constructor(options: CustomExceptionOptions) {
    super({ ...options, code: 500 });
  }
}

export class BadRequestExceptionAdapter extends ExceptionAdapterBase {
  constructor(options: CustomExceptionOptions) {
    super({ ...options, code: 400 });
  }
}

/**
 * Adaptador centralizado para instanciar excepciones personalizadas.
 * Facilita la creación rápida de errores tipificados.
 */
export class CustomExceptionAdapter {
  static notFoundException(options: CustomExceptionOptions) {
    return new NotFoundExceptionAdapter(options);
  }

  static unauthorizedException(options: CustomExceptionOptions) {
    return new UnauthorizedExceptionAdapter(options);
  }

  static forbiddenException(options: CustomExceptionOptions) {
    return new ForbiddenExceptionAdapter(options);
  }

  static internalServerException(options: CustomExceptionOptions) {
    return new InternalServerExceptionAdapter(options);
  }

  static badRequestException(options: CustomExceptionOptions) {
    return new BadRequestExceptionAdapter(options);
  }
}
