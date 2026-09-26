# 2026-09-25-003 — Fase 1 del plan de mejoras: integridad de datos

## Qué se pidió

- Implementar la Fase 1 del plan `app-gestion-medica/docs/plans/2026-09-25-plan-mejoras.md` en el backend (rama `dt/modules`): M-13 a M-15 y M-17 a M-25. M-16 es del frontend.
- Orden: M-13 antes de cualquier cambio de esquema; los scripts de depuración antes de sus índices únicos.
- Respaldo completo antes de tocar la base. Cada cambio de esquema es una migración con `down()`. Cada índice único se verifica en `pg_indexes` y con un INSERT duplicado dentro de `BEGIN … ROLLBACK` que debe fallar con 23505.
- M-18 y M-19 **no** se depuran: requieren una decisión de producto. Se recolectan los datos para decidir y sus índices quedan escritos como migración, sin aplicar.
- Commits incrementales (máx. ~400 líneas revisables), sin push.

## Respaldo y bases de trabajo

| Qué | Dónde / resultado |
|---|---|
| Respaldo completo previo | `d:\_trabajo\dtoro\Documentos\tesis\backups\bd_gestion_medica_pre_fase1_20260925-205109.dump` (295 188 bytes, `pg_restore -l`: 234 entradas del TOC). Fuera de los repos |
| Copia de trabajo | `bd_gestion_medica_f1`: `createdb` + `pg_restore --no-owner` del respaldo (41 tablas). Cada migración se probó primero aquí |
| Base vacía para generar | `bd_gestion_medica_f1_empty`: solo los esquemas, para que `migration:generate` produzca el esquema completo |
| Base vacía para verificar | `bd_gestion_medica_f1_fresh`: `migration:run` desde cero y comparación contra la real |

## M-13 — Migraciones y retiro de `synchronize()`

**Qué se hizo**

- `src/database/data-source.ts`: `DataSource` solo para la CLI de TypeORM. Lee la misma configuración (`configuration.ts` + `.env`); `DB_NAME` de la variable de entorno tiene prioridad, lo que permite apuntar a una copia.
- Scripts en `package.json`: `typeorm`, `migration:generate`, `migration:create`, `migration:run`, `migration:revert`, `migration:show` (con `ts-node` + `tsconfig-paths`, porque las entidades importan `src/...`) y `migration:run:prod` (sobre `dist/`, sin devDependencies).
- Migración inicial `src/database/migrations/1790384118206-InitialSchema.ts`, generada contra una base vacía. Ajustes manuales:
  - Crea la extensión `uuid-ossp` y los esquemas `seguridad`, `parametro`, `selfManagement` y `auditoria` antes de las tablas.
  - Los nombres de 28 restricciones se reemplazaron por los de la base real (`*_pkey`, `PK_permisos` y los `UQ_…` de las 1:1 en lugar de `REL_…`). Sin eso, una migración posterior que referencie una restricción por nombre fallaría en un ambiente u otro.
  - Incluye la función `seguridad.asignar_super_permisos`, que existe en la base real y no nace de ninguna entidad.
- `SchemaInitService` ya no llama a `synchronize()`; conserva la creación de esquemas (`CREATE SCHEMA IF NOT EXISTS`), que es inocua. Borrar el servicio completo fue denegado por el sistema de permisos, así que se dejó así, que es lo que pedía la tarea.
- Baseline en la base real: `docs/info/migrations/2026-09-25-baseline-migracion-inicial.sql` crea `public.migrations` e inserta la fila de la migración inicial sin ejecutarla. Idempotente (probado dos veces en la copia).

**Verificación**

| Prueba | Resultado |
|---|---|
| `migration:generate` contra la copia, antes de todo | "No changes in database schema were found": las entidades coinciden con la base |
| `migration:run` sobre una base vacía (`_fresh`) + huella del esquema (columnas, tipos, nulos, defaults, restricciones, índices, enums y funciones) comparada con la real | Única diferencia: la tabla huérfana `parametro.departments_doctors` (la elimina M-24) y la propia tabla `migrations` |
| Baseline en la real + `migration:show` | `[X] 1 InitialSchema1790384118206` |
| `migration:generate` justo después, en la real | Sin cambios (sin drift) |
| `rg "synchronize\(" src` | 0 llamadas (queda `synchronize: false` en la conexión y en el DataSource) |

**Procedimiento de despliegue**

1. `pg_dump -Fc` de la base.
2. Solo en una base que ya tenía el esquema de `synchronize()` y todavía no tiene `public.migrations`: correr una vez `docs/info/migrations/2026-09-25-baseline-migracion-inicial.sql`.
3. `npm run build` y `npm run migration:run:prod` (o `npm run migration:run` en desarrollo).
4. Arrancar la API. Si falta una migración, la API arranca igual pero con el esquema viejo: el paso 3 es obligatorio.
5. Base nueva (vacía): solo el paso 3; la migración inicial crea esquemas, extensión, tablas y la función.
6. Revertir: `npm run migration:revert` deshace la última migración.

El `Dockerfile` no se modificó: el `CMD` sigue siendo `node dist/main.js`. Correr `migration:run:prod` antes del arranque queda a cargo del despliegue (ver Pendiente).
