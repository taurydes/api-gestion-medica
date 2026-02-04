# Guía para agentes AI — API Gestión Médica (NestJS)

## Big picture (cómo está armada)
- Backend NestJS tomado como base y adaptado a **gestión médica** (módulos en `src/`). Núcleo: TypeORM+PostgreSQL, Redis (caché + sesiones) y BullMQ (colas). Ver [src/app.module.ts](src/app.module.ts) y [src/main.ts](src/main.ts).
- Conexión DB principal: TypeORM named connection `DatabaseConnectionName.DB_MAIN`; al inyectar repositorios usa `@InjectRepository(Entity, DatabaseConnectionName.DB_MAIN)` (ej.: [src/user/user-security.service.ts](src/user/user-security.service.ts)).
- Variables de entorno: `ConfigModule` global + validación Joi. Si agregas nuevas variables, actualiza [src/configuration/validation.ts](src/configuration/validation.ts) y [src/configuration/configuration.ts](src/configuration/configuration.ts).
- DB: `getMainConnection()` usa `autoLoadEntities: true` y `synchronize: false` (migraciones/esquemas se gestionan fuera del runtime). Ver [src/database/getMainConnection.ts](src/database/getMainConnection.ts).

## Entidades/DB (convenciones reales)
- Entidades suelen usar `deletedAt/createdAt/updatedAt` y filtrar `deletedAt IS NULL` en QueryBuilder o hacer “soft delete” seteando `deletedAt = new Date()` (ej.: [src/parameters/services/identity-document.service.ts](src/parameters/services/identity-document.service.ts)).
- Algunas entidades mapean nombres de columna en español vía `@Column({ name: '...' })` (ej.: timestamps y `role_id` en [src/user/entities/user.system.entity.ts](src/user/entities/user.system.entity.ts)). Mantén propiedades en inglés y columnas en español cuando la tabla ya esté así.

## Seguridad (orden real de guards)
- Guards globales en este orden: `JwtAuthGuard` → `SessionGuard` → `PermissionsGuard` (ver [src/main.ts](src/main.ts)).
- JWT se toma desde `Authorization: Bearer ...` o cookie `access_token` (ver [src/auth/guards/jwt-auth.guard.ts](src/auth/guards/jwt-auth.guard.ts)).
- Sesión única por usuario en Redis: clave `session:${userId}` con `access_token`/`refresh_token`; `SessionGuard` valida que el `access_token` presentado coincida con el almacenado (ver [src/redis-session/redis-session.service.ts](src/redis-session/redis-session.service.ts) y [src/auth/guards/session.guard.ts](src/auth/guards/session.guard.ts)).
- Para endpoints públicos usa `@Public()` (ver [src/auth/decorators/public.decorator.ts](src/auth/decorators/public.decorator.ts)).
- RBAC por permisos: usa `@Permission('modulo.accion')` y valida vía `PermissionsGuard` (ver [src/auth/decorators/permission.decorator.ts](src/auth/decorators/permission.decorator.ts) y [src/auth/guards/permission.guard.ts](src/auth/guards/permission.guard.ts)).
- Auth emite `access_token` + `refresh_token` y los guarda en Redis; si agregas/renombras envs de refresh, también debes validarlas con Joi (en código se usan `JWT_REFRESH_SECRET`/`JWT_REFRESH_EXPIRES_IN`, ver [src/auth/auth.service.ts](src/auth/auth.service.ts)).

## Respuestas y manejo de errores
- Respuesta estándar: `HttpResponseInterceptor` envuelve en `{ code, data }` (si el handler ya devuelve `{ data, ... }`, solo agrega `code`). Ver [src/common/interceptors/HttpResponse.interceptor.ts](src/common/interceptors/HttpResponse.interceptor.ts).
- Excepciones: usa `BadRequestException`/`NotFoundException`/`UnauthorizedException`, etc. El filtro global registra en Logs y responde `{ data: null, error, statusCode }`. Ver [src/common/exceptions/HttpExceptionFilter.ts](src/common/exceptions/HttpExceptionFilter.ts).

## Cache Redis (patrón del proyecto)
- Cache global Redis via `CacheModule` en [src/app.module.ts](src/app.module.ts); el uso es manual desde servicios con `cacheManager.get/set/del`.
- Convención de keys:
  - Detalle: `resource:${id}` (ej.: `menu:${id}` en [src/menu/menu.service.ts](src/menu/menu.service.ts)).
  - Listas/paginación: `resource:query:${JSON.stringify(query)}` y registrar keys en `resource:query:keys` para invalidación masiva (ej.: menús en [src/menu/menu.service.ts](src/menu/menu.service.ts)).
- En `create/update/remove` invalida: clave de detalle, clave(s) globales tipo `resource:all` si existen, y **todas** las keys listadas en `resource:query:keys`.

## Convenciones de módulos/DTOs
- DTOs de query suelen extender `QueryPaginationDto` (page/limit/order) y confían en `ValidationPipe({ transform: true })`. Ver [src/common/dto/query-pagination.dto.ts](src/common/dto/query-pagination.dto.ts).
- Soft delete: varias entidades exponen `deletedAt`; servicios suelen filtrar `deletedAt IS NULL` o setear `deletedAt = new Date()` (ej.: [src/parameters/services/identity-document.service.ts](src/parameters/services/identity-document.service.ts)).
- Comentarios y mensajes de error: en español (consistencia del repo).

## Integraciones internas
- UI server-side: Handlebars para Logs/BullBoard (assets y baseViewsDir configurados en [src/main.ts](src/main.ts); doc interna en [src/logs/views/README.md](src/logs/views/README.md)).
- Archivos: `FilesService` guarda en `UPLOADS_PATH` y construye URLs con `URL_HOST`/`PORT`; para video usa ffprobe/ffmpeg (ver [src/files/files.service.ts](src/files/files.service.ts)).

## Workflows rápidos
- Dev: `npm run dev` | Debug: `npm run start:debug` | Lint: `npm run lint` | Tests: `npm test` (ver scripts en [package.json](package.json)).
- Docker: [docker-compose.yml](docker-compose.yml) levanta API + Redis; Postgres está comentado (normalmente se usa un Postgres externo). También monta `UPLOADS_PATH:/app/uploads`.
- UIs internas: Swagger solo en `NODE_ENV=development` en `/api`; Logs UI en `/logs/ui/view`; Bull Board en `/admin/queues` (ver [src/main.ts](src/main.ts)).
