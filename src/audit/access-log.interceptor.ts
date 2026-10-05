import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
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
// Downloading a generated recipe PDF is a clinical read; polling a job's status is not.
const AUDITED_READ_PATTERNS = [/^\/documents\/jobs\/[^/]+\/file$/];
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Token refresh and logout are session noise, not data changes; a successful login is not recorded either.
const SKIPPED_WRITES = new Set(['/auth/refresh', '/auth/logout']);
// API login and the Bull Board login: only failures are recorded (no user, the credential typed as resourceId).
const LOGIN_PATHS = new Set(['/auth/login', '/admin/login']);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type LoginBody = { credential?: unknown; username?: unknown } | undefined;

/** What to record for a request, or null when it is not audited; `failedOnly` rows are written only on error. */
export function describeAccess(method: string, url: string, params: Record<string, string> = {}, body?: LoginBody) {
  const path = url.split('?')[0];
  const resource = path.split('/').filter(Boolean)[0] ?? '';
  if (method === 'POST' && LOGIN_PATHS.has(path)) {
    const attempted = String(body?.credential ?? body?.username ?? '').trim().slice(0, 64) || null;
    return { path, resource, resourceId: attempted, action: 'login_failed', failedOnly: true } as const;
  }
  const isWrite = WRITE_METHODS.has(method);
  const auditedRead =
    method === 'GET' &&
    (AUDITED_READ_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) ||
      AUDITED_READ_PATTERNS.some((pattern) => pattern.test(path)));
  if (isWrite ? SKIPPED_WRITES.has(path) : !auditedRead) {
    return null;
  }
  const resourceId = params.id ?? params.fileId ?? Object.values(params).find((v) => UUID.test(v)) ?? UUID.exec(path)?.[0] ?? null;
  return { path: path.slice(0, 500), resource: resource.slice(0, 60), resourceId, action: isWrite ? 'write' : 'read', failedOnly: false } as const;
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
    const described = describeAccess(req.method, req.originalUrl ?? req.url ?? '', req.params, req.body);
    if (!described) return next.handle();
    const { failedOnly, ...access } = described;

    const record = (statusCode: number) =>
      this.repo
        .insert({
          ...access,
          method: req.method,
          userId: req.user?.id ?? null,
          statusCode,
          ip: (req.ip ?? '').slice(0, 64) || null,
        })
        .catch((error) => this.logger.error(`No se pudo registrar el acceso: ${error.message}`));

    return next.handle().pipe(
      tap({
        next: () => {
          if (!failedOnly) record(context.switchToHttp().getResponse().statusCode);
        },
        error: (error) => {
          if (failedOnly) record(error instanceof HttpException ? error.getStatus() : 500);
        },
      }),
    );
  }
}
