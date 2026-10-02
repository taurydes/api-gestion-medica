import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { LogCreationOptions } from 'src/logs/logs.const';
import { LogsService } from 'src/logs/logs.service';

/**
 * Estructura del cuerpo de error HTTP capturado.
 */
/** Client-facing text for non-HTTP errors: the raw detail (e.g. a driver message) only goes to the log. */
export const INTERNAL_ERROR_MESSAGE = 'Error interno del servidor.';

/** Body-parser limit for JSON and urlencoded bodies; `main.ts` and the 413 message share it. */
export const BODY_LIMIT_MB = 30;

/** body-parser errors are plain `Error`s with `status`/`type`: give them their 4xx and a Spanish message. */
export function fromBodyParserError(exception: any): HttpException | null {
  if (!exception || exception instanceof HttpException) return null;
  const status = exception.status ?? exception.statusCode;
  if (exception.type === 'entity.too.large' || status === 413) {
    return new PayloadTooLargeException(
      `El cuerpo de la solicitud supera el tamaño máximo permitido (${BODY_LIMIT_MB} MB).`,
    );
  }
  if (exception.type === 'entity.parse.failed') {
    return new BadRequestException('El cuerpo de la solicitud no es un JSON válido.');
  }
  if (exception.expose === true && Number.isInteger(status) && status >= 400 && status < 500) {
    return new HttpException('La solicitud no se pudo procesar.', status);
  }
  return null;
}

interface HttpErrorBody {
  message?: string;
  [k: string]: any;
}

/**
 * Filtro global de excepciones HTTP.
 *
 * Intercepta y maneja cualquier excepción ocurrida durante
 * la ejecución de la aplicación. Registra los errores en
 * LogsService y devuelve una respuesta estandarizada al cliente.
 */
@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logsService: LogsService) {}

  /**
   * Captura cualquier excepción lanzada y procesa su respuesta.
   */
  async catch(exception: any, host: ArgumentsHost) {
    exception = fromBodyParserError(exception) ?? exception;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req: any = ctx.getRequest();

    // Determina si la excepción es de tipo HTTP
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;

    // Obtiene y normaliza el cuerpo de la excepción
    let rawResp = isHttp ? (exception as HttpException).getResponse() : null;
    if (typeof rawResp === 'string') rawResp = { message: rawResp };
    const body: HttpErrorBody = (rawResp as HttpErrorBody) || {
      message: exception?.message || 'Error',
    };

    // Extrae el ID de usuario si está disponible
    const userId = req.user?.payload?.id ?? req.user?.id ?? '00000000-0000-0000-0000-000000000000';

    // Datos adicionales del request
    const hostHeader = req.headers['host'] as string | undefined;
    const appVersion =
      (req.headers['x-app-version'] as string | undefined) ||
      process.env.APP_VERSION ||
      process.env.npm_package_version ||
      null;

    // Construye el objeto de log para registrar la excepción
    const exceptionRequest: LogCreationOptions & { req?: any } = {
      exceptionType: exception?.constructor?.name || 'UnknownException',
      message: body.message || exception?.message || 'Error',
      stackTrace: exception?.stack,
      statusCode: status,
      route: req.url,
      httpMethod: req.method,
      userId,
      headers: req.headers,
      requestQuery: req.query,
      requestBody: req.body,
      context: {
        params: req.params,
        ip:
          req.ip?.replace('::ffff:', '') ||
          req.socket?.remoteAddress?.replace('::ffff:', '') ||
          '',
        origin: req.headers['origin'],
        referer: req.headers['referer'],
      },
      tags: ['exception'],
      handled: true,
      occurredAt: new Date(),
      host: hostHeader,
      appVersion: appVersion ?? 'No Disponible',
      req,
    };

    const clientMessage = isHttp ? exceptionRequest.message : INTERNAL_ERROR_MESSAGE;

    // Evita registrar excepciones triviales
    if (req.url === '/' || req.url === '/favicon.ico') {
      return res.status(status).json({
        data: null,
        error: clientMessage,
        statusCode: status,
      });
    }

    // Intenta registrar el log de error
    try {
      await this.logsService.create(exceptionRequest);
    } catch (error) {
      console.error('Error al registrar el log, ' + error.message);
    }

    // Devuelve respuesta estandarizada
    res.status(status).json({
      data: null,
      error: clientMessage,
      statusCode: status,
    });
  }
}
