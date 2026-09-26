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

## M-14 y M-15 — Cierre de consulta y recetas atómicos

**Qué se hizo**

- `finishConsultation` corre en `dataSource.transaction()`: relee la cita con `pessimistic_write` dentro de la transacción, crea el historial, la receta y marca la cita `COMPLETED` con el mismo `EntityManager`. Las cachés se limpian solo después del commit.
- Antes de abrir la transacción valida los `medicationId` de los ítems (`RecipeService.assertMedicationsExist`): inexistente o borrado → 404 "Los medicamentos con ID … no existen o han sido eliminados." sin escribir nada.
- `MedicalHistoryService.create(dto, userId, manager?)` y `RecipeService.create(dto, userId, manager?)`: con `manager` usan sus repositorios y no limpian caché ni recargan (el llamador lo hace tras el commit). Sin `manager`, `recipe.create` abre su propia transacción.
- `recipe.update`: valida medicamentos primero; el `update` de cabecera, el `delete` y el `save` de ítems van en una transacción.
- `RecipeService.invalidateCaches` también borra `recipe:medical-history:{id}` y `recipe:patient:{id}` al crear (antes solo al editar).

**Decisiones**

| Decisión | Motivo |
|---|---|
| Referencias faltantes o borradas en `recipe.create` → 404 (antes 400) | Criterio de M-22 ("crear una receta que referencia una historia borrada → 404"); se aplicó igual a paciente, doctor y medicamentos para que el endpoint sea coherente. `medical-history.create` conserva sus 400 |
| Bloqueo `pessimistic_write` sobre la cita | Dos cierres simultáneos: el segundo espera y ve `COMPLETED` (400) en lugar de chocar con el índice único |
| Tests con un `DataSource` falso en memoria (`test/in-memory-db.ts`) | Permite verificar el rollback real (0 filas tras el fallo) y el reintento, invocando los tres servicios reales |

**Verificación (tests de servicio)**: `src/medical-appointments/finish-consultation.spec.ts` (medicamento inexistente → 404 y 0 historiales; fallo tras insertar el historial → rollback y el reintento cierra la cita; cita completada → 400; medicamento borrado = inexistente) y `src/recipe/recipe-transaction.spec.ts` (create/update con fallo o medicamento inexistente no dejan cabecera huérfana ni borran ítems previos).

## M-17 — Paciente borrado se puede volver a registrar

**Qué se hizo**

- Entidad `Patient`: `common_person_id` pierde `unique: true` y gana `@Index('UQ_patients_common_person_active', …, { unique: true, where: '"deleted_at" IS NULL' })`.
- Migración `1790384775327-PatientsPartialUniquePerson`: quita `UQ_f34e740f037fa739f119134c565` y crea el índice parcial (TypeORM recrea la FK alrededor). `down()` restaura el único total; falla si ya hay una persona con un paciente borrado y otro activo, lo cual es esperable.
- `patient.create` busca el paciente existente con `deletedAt: IsNull()`. `resolvePatient` (citas por documento) ya filtraba borrados; con el índice parcial su INSERT deja de fallar.

**Decisión**: índice parcial + registro nuevo, no reactivación. Es el mismo comportamiento que ya tenía `resolvePatient`, y un `DELETE /patient/:id` se trata como baja del registro. Contra: la historia del paciente anterior queda asociada al registro borrado. Si se prefiere reactivar, el índice parcial sigue sirviendo.

**Verificación**

| Prueba | Copia `_f1` | Real |
|---|---|---|
| `migration:run` → `revert` → `run` | OK | `run` OK |
| `migration:generate` después | Sin cambios | Sin cambios |
| `pg_indexes` | `CREATE UNIQUE INDEX "UQ_patients_common_person_active" … (common_person_id) WHERE (deleted_at IS NULL)` | Igual |
| INSERT duplicado con ambos `deleted_at` nulos (`BEGIN … ROLLBACK`) | 23505 | 23505 |
| Borrar un paciente y crear otro para la misma persona (`BEGIN … ROLLBACK`) | OK | OK |
| Tests | `src/patient/patient-reregister.spec.ts`: paciente borrado → se crea uno nuevo activo; paciente activo → 400 | |
