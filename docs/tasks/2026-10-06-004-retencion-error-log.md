# 2026-10-06-004 — Purga automática por retención de `auditoria.error_log`

Continúa la tarea 003 (retención de `access_log`), que dejó pendiente la retención de `error_log`.

## Qué se pidió

- Retención configurable con `ERROR_LOG_RETENTION_DAYS` (default 7). Valor inválido → 7 con warning.
- Misma mecánica que la purga de `access_log` (6776c3d): job diario en la cola `maintenance` con scheduler de id fijo,
  `DELETE` por lotes de 5000, lock en Redis propio. Reutilizar/generalizar en vez de duplicar.
- Índice sobre `occurred_at` (no existía) con migración TypeORM, sin drift después; aplicarla en la BD de desarrollo y
  verificarla en `pg_indexes`.
- Correr el SQL de purga contra la BD real dentro de una transacción con `ROLLBACK` y confirmar con `EXPLAIN` que usa el
  índice.
- `ERROR_LOG_RETENTION_DAYS=7` en el `docker-compose.yml` de `tesis/`. Sin commit.

## Qué se hizo

| Archivo | Cambio |
|---|---|
| `src/maintenance/maintenance.const.ts` (nuevo) | `MAINTENANCE_QUEUE` (antes vivía en `access-log-retention.const.ts`) |
| `src/maintenance/retention.util.ts` (nuevo) | Extraído de la purga de `access_log`: `PurgeResult`, `parseRetentionDays(raw, fallback)`, `resolveRetentionDays()` (parse + warning) y `withRedisLock()` (`SET NX EX` con token + liberación compare-and-delete en Lua) |
| `src/maintenance/maintenance.processor.ts` (movido desde `src/audit/access-log-retention.processor.ts`) | Único worker de la cola `maintenance`: registra ambos schedulers (`access-log-purge` a las 03:00, `error-log-purge` a las 03:15) y despacha por nombre de job; un nombre desconocido sigue siendo `UnrecoverableError` |
| `src/maintenance/maintenance.module.ts` (nuevo), `src/app.module.ts` | Módulo que importa `AuditModule` y `LogsModule` y aloja el processor |
| `src/audit/access-log-retention.const.ts`, `.service.ts`, `audit.module.ts` | Usa los helpers compartidos; sin cambio de comportamiento. `AuditModule` ya no aloja el processor ni importa `QueuesModule`; exporta `AccessLogRetentionService` |
| `src/logs/error-log-retention.const.ts` (nuevo) | Job `error-log-purge`, default 7, lote 5000, cron `15 3 * * *`, lock `lock:error-log-purge` (EX 3600 s) |
| `src/logs/error-log-retention.service.ts` (nuevo), `logs.module.ts` | `purge()` análogo al de `access_log`; `LogsModule` lo registra y exporta |
| `src/logs/entities/error-log.entity.ts` | `@Index('idx_error_log_occurred_at')` sobre `occurredAt` (nombre explícito como en `AccessLog`) |
| `src/database/migrations/1790521500000-ErrorLogOccurredAtIndex.ts` (nuevo) | `CREATE INDEX "idx_error_log_occurred_at" ON "auditoria"."error_log" ("occurred_at")`; SQL tomado de `migration:generate --dryrun` |
| `src/queues/queues.module.ts`, `queues.service.ts` | Importan `MAINTENANCE_QUEUE` desde `src/maintenance` |
| `src/configuration/validation.ts` | `ERROR_LOG_RETENTION_DAYS: Joi.string().allow('').optional()` |
| `../docker-compose.yml` (fuera de este repo) | `ERROR_LOG_RETENTION_DAYS=7` junto a `ACCESS_LOG_RETENTION_DAYS` |
| `src/logs/error-log-retention.service.spec.ts` (nuevo) | 11 tests contra el service real |
| `src/maintenance/retention.util.spec.ts` (nuevo) | 7 tests de `parseRetentionDays` (reemplazan los 6 que estaban en el spec de `access_log`) |

## Decisiones

| Decisión | Razón |
|---|---|
| Un solo processor para la cola `maintenance` | Dos `@Processor('maintenance')` serían dos workers compitiendo por los mismos jobs: el de `access_log` recibiría `error-log-purge` y lo marcaría fallido. Un despachador por nombre de job lo evita |
| Processor en un módulo propio (`MaintenanceModule`) | Necesita los services de `AuditModule` y `LogsModule`; meterlo en `QueuesModule` crearía un ciclo (ambos importan `QueuesModule`) y dejarlo en `AuditModule` haría que auditoría dependa de logs |
| Se extrajeron parse + lock, no el bucle de lotes | El bucle son 5 líneas y cada tabla tiene su propio corte; el lock y el parseo sí eran lógica idéntica |
| Corte calculado en Node (`new Date(Date.now() - días)`) y no `now()` de Postgres, a diferencia de `access_log` | `occurred_at` es `timestamp` sin zona, pero **no** lo llena el `DEFAULT now()`: `HttpExceptionFilter` asigna `occurredAt: new Date()` y `pg` serializa el `Date` como hora local de Node con offset, que Postgres descarta al guardar en `timestamp` sin zona. La fila guarda la hora de pared de Node (milisegundos en `max(occurred_at)`: `14:49:06.987`). Pasar el corte como `Date` por el mismo camino lo deja en el mismo reloj aunque la `TimeZone` de Postgres y la `TZ` del contenedor difieran. Verificado: el parámetro llegó como `2026-09-29 15:55:26.504`, la hora local de Node (-04) |
| Corte fijo por ejecución | Se calcula una vez antes del primer lote: todos los lotes borran contra el mismo instante |
| 03:15 y no 03:00 | Evita que ambas purgas compitan por I/O; cada una tiene su lock, así que tampoco se bloquean entre sí |
| Índice simple, sin `CONCURRENTLY` | 3.012 filas; el `CREATE INDEX` tarda milisegundos. TypeORM corre migraciones en transacción y `CONCURRENTLY` no se permite ahí |

## Verificación

- `migration:run` en la BD de desarrollo (la misma que usa `medos-backend` vía `host.docker.internal`): ejecutada
  `ErrorLogOccurredAtIndex1790521500000`.
- `pg_indexes`: `CREATE INDEX idx_error_log_occurred_at ON auditoria.error_log USING btree (occurred_at)`.
- `migration:generate --dryrun` después: "No changes in database schema were found".
- SQL de purga contra la BD real, retención 7 días, dentro de transacción con `ROLLBACK` (tras `ANALYZE`):
  - 3.012 filas en total (2026-03-21 → 2026-10-06), **893 se borrarían** (un solo lote, < 5000).
  - `EXPLAIN`: el subselect usa `Index Scan using idx_error_log_occurred_at` con
    `Index Cond: (occurred_at < '2026-09-29 15:55:26.504'::timestamp without time zone)`. El `DELETE` externo hace un
    `Hash Semi Join` con `Seq Scan` sobre la tabla porque tiene 3.012 filas; es elección del planner por tamaño.
  - Tras el `ROLLBACK` la tabla sigue en 3.012 filas.
- `npm run build`: 0 errores.
- `npx jest --runInBand`: **96 suites, 777 tests, todos verdes** (baseline anterior 94 / 765: +2 suites, +12 tests netos).

## Qué quedó fuera

- `.env.example`: no editado (archivos `.env*` bloqueados para el agente). Falta agregar `ERROR_LOG_RETENTION_DAYS=7`
  a mano. Ojo: `.env.example` ya aparece modificado en el working tree y no es por esta tarea.
- No se reconstruyó `medos-backend`. **Hasta reconstruirlo**, el contenedor corre el processor viejo, que solo conoce
  `access-log-purge`; el scheduler `error-log-purge` se registra recién al arrancar el código nuevo, así que no hay
  jobs huérfanos mientras tanto. En un despliegue con instancias mezcladas, una vieja que tome `error-log-purge` lo
  marcaría fallido y se reintentaría la noche siguiente.
- No se levantó la app para probar la inyección de dependencias del `MaintenanceModule` (se evitó registrar el
  scheduler en el Redis compartido desde fuera del contenedor); cubierto solo por el build.
- No se probó el disparo real del cron ni dos instancias simultáneas.
- Con 7 días, la primera purga borra ~30 % de `error_log` (893 filas); el módulo de logs de la UI dejará de mostrar
  errores de más de una semana.
