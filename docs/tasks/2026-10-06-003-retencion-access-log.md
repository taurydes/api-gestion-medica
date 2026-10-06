# 2026-10-06-003 — Purga automática por retención de `auditoria.access_log`

## Qué se pidió

- Retención configurable con `ACCESS_LOG_RETENTION_DAYS` (default 90). Valor inválido (no entero o < 1) → default con
  warning en el log. Documentarla en el esquema de env y en el docker-compose.
- Job diario a hora de bajo tráfico (03:00) que borre filas con `created_at < now() - retención`, por lotes (5000), con
  lock en Redis (`SET NX EX`) para que una sola instancia purgue, logueando cuántas filas borró.
- Asegurar índice sobre `created_at`; migración solo si falta. Sin drift de modelo después.
- Tests unitarios contra el service real.
- Revisar si `auditoria.error_log` tiene retención (sin cambiarla) y medir tamaños reales de ambas tablas.

## Qué se hizo

| Archivo | Cambio |
|---|---|
| `src/audit/access-log-retention.const.ts` (nuevo) | Cola `maintenance`, job `access-log-purge`, cron `0 3 * * *`, lote 5000, lock `lock:access-log-purge` (EX 3600 s), `parseRetentionDays()` |
| `src/audit/access-log-retention.service.ts` (nuevo) | `purge()`: toma el lock con token aleatorio, borra en lotes hasta que uno vuelve con menos de 5000, loguea el total y libera el lock solo si sigue siendo suyo (script Lua compare-and-delete) |
| `src/audit/access-log-retention.processor.ts` (nuevo) | Worker de la cola `maintenance`; en `onApplicationBootstrap` hace `upsertJobScheduler` con el cron en `TZ` de la app |
| `src/audit/audit.module.ts` | Importa `QueuesModule` y `ConfigModule`; registra service y processor |
| `src/queues/queues.module.ts`, `queues.service.ts` | Registra la cola `maintenance` y la expone en Bull Board |
| `src/configuration/validation.ts` | `ACCESS_LOG_RETENTION_DAYS: Joi.string().allow('').optional()` |
| `../docker-compose.yml` (fuera de este repo) | `ACCESS_LOG_RETENTION_DAYS=90` en el servicio `backend` |
| `src/audit/access-log-retention.service.spec.ts` (nuevo) | 16 tests |

## Decisiones

| Decisión | Razón |
|---|---|
| BullMQ job scheduler, no `@nestjs/schedule` | `@nestjs/schedule` no es dependencia; el proyecto ya usa BullMQ para `documents` y `email`. `upsertJobScheduler` con id fijo es idempotente: todas las instancias lo llaman y Redis guarda un único schedule. Además queda visible en Bull Board |
| Lock Redis igual, aunque BullMQ ya entrega cada job a un solo worker | Si un job queda "stalled" (worker colgado sin renovar su lock de BullMQ) se reentrega a otra instancia mientras la primera sigue borrando. El lock (1 h) evita dos purgas solapadas. Se usa el cliente `REDIS_SESSION_CLIENT`, que ya es global |
| Liberación con compare-and-delete | Si una purga supera la hora y el lock expira, la instancia vieja no borra el lock de la nueva |
| Joi como `string` opcional, no `number().min(1)` | El pedido es caer al default con warning; una regla numérica en Joi tumbaría el arranque ante un valor inválido |
| Corte calculado en SQL (`now() - make_interval(days => :days)`) y no un `Date` de Node | `created_at` es `timestamp` sin zona con default `now()` del servidor PostgreSQL; comparar contra el reloj de la BD evita el desfase de zona entre el contenedor y Postgres en Windows |
| `DELETE ... WHERE id IN (SELECT id ... ORDER BY created_at LIMIT 5000)` | PostgreSQL no admite `DELETE ... LIMIT`; el subselect usa `idx_access_log_created_at` (verificado con `EXPLAIN`) |
| Sin migración | `idx_access_log_created_at` ya existe (migración `1790520700000-AccessLog`, confirmado en `pg_indexes`) |

## Mediciones reales (BD de desarrollo, 2026-10-06)

| Tabla | Filas | Tamaño total | Heap | Índices | Bytes/fila (con índices) | Rango | Filas/día |
|---|---|---|---|---|---|---|---|
| `auditoria.access_log` | 8.533 | 2,56 MiB (2.686.976 B) | 1,58 MiB | 0,95 MiB | ~315 | 2026-10-04 → 2026-10-06 (2,16 días) | ~3.950 (1.264 / 5.994 / 1.275 por día) |
| `auditoria.error_log` | 3.012 | 5,70 MiB (5.980.160 B) | 3,56 MiB | 0,31 MiB | ~1.985 | 2026-03-21 → 2026-10-06 (199,6 días) | ~15 promedio; picos de 672 y 966 (04 y 05-10) |

Proyección `access_log` al ritmo de desarrollo (inflado por QA): ~1,2 MB/día → 90 días ≈ 355 mil filas ≈ 110 MB.
Es manejable; 90 días es razonable. Con tráfico real de una clínica el ritmo debería ser menor.

**`error_log` no tiene retención**: no hay `DELETE` en `src/logs`, ni job ni índice sobre `occurred_at`. Crece sin
límite, y por fila pesa ~6 veces lo de `access_log` (guarda `stack_trace`). No se tocó, según lo pedido.

## Verificación

- SQL de purga ejecutado contra la BD real dentro de una transacción con `ROLLBACK` (retención 1 día): habría borrado
  3.894 filas; `EXPLAIN` muestra `Index Scan using idx_access_log_created_at`.
- `migration:generate --dryrun`: "No changes in database schema were found".
- `npm run build`: 0 errores.
- `npx jest --runInBand`: **94 suites, 765 tests, todos verdes** (baseline anterior 93 / 749).

## Qué quedó fuera

- `.env.example`: no se pudo editar (los archivos `.env*` están bloqueados para el agente por permisos). Falta agregar
  `ACCESS_LOG_RETENTION_DAYS=90` a mano.
- No se reconstruyó el contenedor `medos-backend`; la purga empieza a programarse en el próximo despliegue.
- No se probó el disparo real del cron a las 03:00 ni el comportamiento con dos instancias levantadas a la vez.
- Retención de `error_log`: pendiente de decisión (sugerencia: misma mecánica en la cola `maintenance`, más un índice
  sobre `occurred_at`).
