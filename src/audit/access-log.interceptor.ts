import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, tap } from 'rxjs';
import { Repository } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { AccessLog } from './entities/access-log.entity';

/** Reads worth a trail: clinical records and the patient file (MJ-39). Writes are always logged. */
export const AUDITED_READ_PREFIXES = [
  '/patient',
  '/medical-history',
  '/recipes',
  '/mammography-analyses',
  '/medical-appointments',
  '/files/appointment-files',
];
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Login and token refresh are not data changes; failures already go to auditoria.error_log.
const SKIPPED_WRITES = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** What to record for a request, or null when it is not audited. */
export function describeAccess(method: string, url: string, params: Record<string, string> = {}) {
  const path = url.split('?')[0];
  const resource = path.split('/').filter(Boolean)[0] ?? '';
  const isWrite = WRITE_METHODS.has(method);
  const auditedRead = method === 'GET' && AUDITED_READ_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  if (isWrite ? SKIPPED_WRITES.has(path) : !auditedRead) {
    return null;
  }
  const resourceId = params.id ?? params.fileId ?? Object.values(params).find((v) => UUID.test(v)) ?? UUID.exec(path)?.[0] ?? null;
  return { path: path.slice(0, 500), resource: resource.slice(0, 60), resourceId, action: isWrite ? 'write' : 'read' } as const;
}

/** Records successful audited requests after the response is produced; a failed insert never fails the request. */
@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AccessLogInterceptor.name);

  constructor(
    @InjectRepository(AccessLog, DatabaseConnectionName.DB_MAIN)
    private readonly repo: Repository<AccessLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const access = describeAccess(req.method, req.originalUrl ?? req.url ?? '', req.params);
    if (!access) return next.handle();

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        this.repo
          .insert({
            ...access,
            method: req.method,
            userId: req.user?.id ?? null,
            statusCode: res.statusCode,
            ip: (req.ip ?? '').slice(0, 64) || null,
          })
          .catch((error) => this.logger.error(`No se pudo registrar el acceso: ${error.message}`));
      }),
    );
  }
}
