import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { LogCreationOptions } from 'src/logs/logs.const';
import { LogsService } from 'src/logs/logs.service';

/**
 * Estructura del cuerpo de error HTTP capturado.
 */
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
    const userId = req.user?.payload?.id ?? req.user?.id ?? 'Unknown';

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

    // Evita registrar excepciones triviales
    if (req.url === '/' || req.url === '/favicon.ico') {
      return res.status(status).json({
        data: null,
        error: body.message,
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
      error: exceptionRequest.message,
      statusCode: status,
    });
  }
}
