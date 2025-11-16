import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Interceptor: HttpResponseInterceptor
 *
 * Interceptor global que estandariza las respuestas HTTP.
 * Envuelve los datos devueltos por los controladores en un formato uniforme.
 *
 * Estructura de salida:
 * {
 *   code: <statusCode>,
 *   data: <contenido>
 * }
 *
 * Si la respuesta ya contiene una propiedad `data`, no la anida nuevamente.
 */
@Injectable()
export class HttpResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const statusCode = context.switchToHttp().getResponse().statusCode;

        // Si la respuesta ya tiene 'data', no volver a envolverla
        if (data && typeof data === 'object' && 'data' in data) {
          return { code: statusCode, ...data };
        }

        // Si es un objeto simple, lo envuelve en 'data'
        return { code: statusCode, data };
      }),
    );
  }
}
