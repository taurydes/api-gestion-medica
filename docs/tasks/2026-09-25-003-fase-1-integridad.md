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

## M-18 — Personas duplicadas por documento

**Qué se hizo (sin la depuración ni el índice)**

- `src/common-person/person-document.util.ts`: `personDocumentWhere(letra, documento)` (persona activa con esa letra **y** ese documento; letra ausente = `NULL`, nunca "cualquier letra"), `assertDocumentAvailable` (409 si el cambio choca con otra persona activa; no hace nada si el documento no cambia) y `uniqueViolationToConflict` (23505 → 409; con el nombre del índice de personas da el mensaje específico).
- Búsqueda por letra + documento en todas las altas: `user.create` (antes buscaba solo por documento y vinculaba el usuario nuevo a otra persona), `common-person.create`, `doctors.create`, `patient.create` y `resolvePatient` de citas.
- Validación de duplicados en los `update` que tocan la persona: `user.update`, `common-person.update`, `doctors.update` y `patient.update`.
- 23505 → 409 "El número de documento ya está registrado para otra persona." en esos caminos (antes 400/500 con el texto del driver). `common-person.create` y `user.create` pasan de 400 a 409 ante documento duplicado.
- Script de depuración `docs/info/migrations/2026-09-25-depurar-persona-comun-duplicada.sql` (**no ejecutado**): corrige el documento de la persona elegida, con guarda y verificación antes/después. Probado en una copia desechable: pasa de 1 grupo a 0, es idempotente y la guarda aborta si el documento nuevo ya existe.
- Índice `UQ_persona_comun_documento_activo (letra, documento) WHERE documento IS NOT NULL AND deleted_at IS NULL` escrito como migración en `src/database/migrations-pending/1790399000000-PersonaComunUniqueDocument.ts` (**no aplicado**, fuera del glob de migraciones para no bloquear `migration:run`). Su `up()` aborta si quedan duplicados. En la copia depurada: INSERT duplicado → 23505; misma cédula con otra letra → OK; duplicar una persona borrada → OK. En la real, crear el índice falla hoy con 23505 (confirma que falta la depuración).

**Datos para decidir (solo ids y conteos, consulta de solo lectura)**

| | `7a662859-0c03-4d4e-9271-0d5e57d7cebd` | `d53ebb57-acd5-4786-986d-6436f62df52c` |
|---|---|---|
| Letra | V | V |
| Creada | 2026-02-08 | 2026-03-29 |
| Usuario (`users.common_person_id` = `persona_comun.user_id`) | `8387ca12-a0ab-4188-ae2f-72b7710e5063`, rol `medico`, activo | `ae8e35ec-3397-4a7b-9491-70dbe9e2a739`, rol `medico`, activo |
| Doctor | `ea70bf7a-f7ea-4169-83d8-2caea8cc1a4f` (1 centro, 0 horarios) | `56809bb6-5d91-4d83-b118-cccc7519f5ca` (1 centro, 0 horarios) |
| Paciente | `41841702-db50-43fb-91df-4a373608677d` | — |
| Citas / historias / recetas como médico | 0 / 0 / 0 | 0 / 0 / 0 |
| Citas / historias / recetas / mamografías como paciente | 22 / 17 / 2 / 24 | 0 |
| Imágenes de persona | 7 | 0 |

Comparación sin exponer datos: nombres, teléfono, email del usuario, licencia y centro **difieren**. Son dos personas distintas con el mismo documento, no un registro repetido: la salida propuesta es corregir el documento de una (probablemente `d53ebb57…`, sin actividad clínica), no fusionar. Hace falta el documento correcto, que solo conoce el negocio. Es el único grupo (tampoco hay duplicados por documento solo).

**Para activar el índice**: 1) correr el script con `-v persona_id=… -v letra=… -v documento=…`; 2) mover la migración pendiente a `src/database/migrations`; 3) agregar a `CommonPerson` `@Index('UQ_persona_comun_documento_activo', ['letter', 'documentNumber'], { unique: true, where: '"documento" IS NOT NULL AND "deleted_at" IS NULL' })`; 4) `migration:run` y `migration:generate` (sin drift).

**Límite conocido**: el índice sobre `(letra, documento)` no impide dos filas con el mismo documento y letra `NULL` (en PostgreSQL los `NULL` son distintos). Hoy hay 0 personas sin letra.

**Tests**: `src/common-person/person-document.spec.ts` (E-123 con V-123 existente crea una persona E-123; documento duplicado en alta → 409 sin escribir; `update` a un documento ajeno → 409; reenviar el mismo documento no es conflicto; 23505 de `QueryFailedError` → 409).

## M-19 — Código de especialidad duplicado y nombre sin distinguir mayúsculas

**Qué se hizo**

- `specialty.service`: la verificación de nombre en `create`/`update` compara `LOWER(name) = LOWER(:name)` (parámetro enlazado, sin comodines de `LIKE`); la de código ignora especialidades borradas.
- Script `docs/info/migrations/2026-09-25-depurar-especialidad-mt.sql` (**no ejecutado**): recodifica la especialidad elegida, con guarda y verificación. Probado en una copia desechable: 0 códigos y 0 nombres duplicados después; la guarda aborta si el código nuevo está en uso.
- Migración pendiente `src/database/migrations-pending/1790399100000-SpecialtiesUniqueCodeAndName.ts` (**no aplicada**): `UQ_specialties_code_active (code) WHERE deleted_at IS NULL` y `UQ_specialties_name_lower_active (lower(name)) WHERE deleted_at IS NULL`. Su `up()` aborta si quedan códigos repetidos. En la copia depurada: INSERT con `MT` repetido → 23505; "Mastología" frente a "mastología" → 23505.

**Datos para decidir**

| id | nombre | doctores | departamentos | citas | historias |
|---|---|---|---|---|---|
| `a0c83b33-8003-4731-9411-e4891be7e88b` | Medicina del Trabajo | 0 | 0 | 0 | 0 |
| `fc6618f2-a886-4396-a269-6cc4792daa59` | mastología | 3 | 1 | 15 | 14 |

Todas las referencias son por id, así que recodificar no mueve relaciones. `MT` es la sigla natural de Medicina del Trabajo; la propuesta es recodificar mastología (`MS` está libre). Hoy no hay nombres repetidos sin distinguir mayúsculas (0 grupos en 71 especialidades).

**Para activar**: correr el script; mover la migración a `src/database/migrations`; declarar en `Specialty` `@Index('UQ_specialties_code_active', { synchronize: false })` y `@Index('UQ_specialties_name_lower_active', { synchronize: false })` (el índice de expresión no se puede describir con columnas y, sin la declaración, `migration:generate` propondría borrarlos); `migration:run` y comprobar que no hay drift.

**Tests**: `src/parameters/services/specialty.service.spec.ts` (el filtro de nombre es `LOWER(col) = LOWER(:name)` con parámetro; "Mastología" con "mastología" existente → 400 sin escribir).

## M-20 — Índice único de permisos por rol

- Migración `1790386000000-PermisosMenusUniqueGrant`: `UQ_permisos_menus_rol_menu_permiso_active (rol_id, menu_id, permiso_id) WHERE deleted_at IS NULL`. Entidad `PermissionMenu` con el `@Index` equivalente.
- La misma migración reemplaza `seguridad.asignar_super_permisos`: su `NOT EXISTS` solo saltaba filas con el mismo `user_id`, así que con el índice habría fallado con 23505 al reasignar un rol. Ahora salta cualquier asignación activa de la terna. `down()` restaura la versión original.
- Parcial sobre `deleted_at`: 62 de las 204 filas están revocadas; el servicio reactiva la fila existente en lugar de insertar, así que nunca necesita dos filas activas.
- Datos previos: 0 ternas repetidas.

## M-21 — Índices únicos de catálogos y usuarios

- Migración `1790386100000-CatalogUniqueIndexes` (escrita a mano: `migration:generate` se cae con `TypeError … reading 'name'` porque `public.users` y `seguridad.users` tienen el mismo nombre de tabla y TypeORM busca la restricción en la equivocada):
  - `UQ_medical_centers_name_active (name) WHERE deleted_at IS NULL`
  - `UQ_departments_name_center_active (name, medical_center_id) WHERE deleted_at IS NULL`
  - `UQ_roles_nombre (nombre)` y `UQ_menu_slug (slug)` (totales, como pide el plan; hoy 0 roles borrados y el borrado de menú es físico)
  - `users`: se quitan `UQ_51b8b26ac168fbe7d6f5653e6cf` (name) y `UQ_97672ac88f789774dd47f7c8be3` (email) y se crean `UQ_users_name_active` y `UQ_users_email_active` con `WHERE deleted_at IS NULL`. `users.common_person_id` sigue total (1:1).
- Entidades con los `@Index` equivalentes (`MedicalCenter`, `Department`, `Role`, `Menu`, `User`; en `User` se quita `unique: true` de las columnas).
- Servicios: `medical-center.create` ignora centros borrados al verificar el nombre y traduce un 23505 de carrera a 409; `user.validateUserData` ignora usuarios borrados (mismo alcance que los índices parciales).
- Datos previos: 0 duplicados en todas las tablas.

**Verificación M-20 y M-21**

| Prueba (`BEGIN … ROLLBACK`) | Copia `_f1` | Real |
|---|---|---|
| Terna activa repetida en `permisos_menus` | 23505 | 23505 |
| Terna repetida cuando la previa está revocada (62 elegibles) | OK | OK |
| `asignar_super_permisos` sobre el rol con más permisos | OK (no falla) | OK |
| Centro con nombre de uno activo | 23505 | 23505 |
| Centro con el nombre del centro borrado (1 elegible) | OK | OK |
| Departamento repetido en el mismo centro | 23505 | 23505 |
| Rol repetido / slug repetido | 23505 / 23505 | 23505 / 23505 |
| Email / nombre de usuario activo repetido | 23505 / 23505 | 23505 / 23505 |
| Reusar email y nombre de un usuario borrado | OK | OK |

`migration:run` → `revert` ×2 → `run` en la copia sin errores; `migration:generate` sin cambios en ambas bases. Tests: `src/medical-center/medical-center-unique.spec.ts` (nombre de un centro borrado reutilizable; activo → 400; 23505 → 409).

## M-22 — Los `findOne` devolvían registros borrados

**Decisión**: `deletedAt: IsNull()` explícito, no `@DeleteDateColumn`. `@DeleteDateColumn` no cambia el esquema, pero cambia el comportamiento de todas las consultas y relaciones de la entidad (incluidas las que hoy muestran borrados a propósito, que necesitarían `withDeleted`). El filtro explícito es acotado y revisable.

**Qué se hizo**

- `findOne` por id con `deletedAt: IsNull()` en `patient`, `doctors`, `common-person`, `user`, `medical-history`, `recipe`, `medication` y `departments` (este usaba `deletedAt: undefined`, que TypeORM ignora).
- Búsquedas previas a editar o borrar: `patient.update`, `doctors.update`/`remove`, `medical-history.update`/`remove`/`createMedicalReview` (historial, paciente y doctor), `recipe.markAsDispensed`/`cancel`, `departments.create`/`update`/`remove` (departamento y centro) y `medical-appointments` `update`/`cancel`/`confirm`/`remove` y las referencias de especialidad, centro y departamento al crear la cita.
- Validaciones de referencia: `medical-history.create`, `recipe.create` (ver M-14/M-15) y las alergias, enfermedades y medicamentos del paciente (`activeByIds` en lugar de `findByIds`).

**Tests**: `src/common/soft-delete-lookups.spec.ts` (paciente, doctor, receta y departamento borrados → 404) y el caso de historia borrada en `recipe-transaction.spec.ts`.

## M-23 — Un solo dueño de la relación User ↔ CommonPerson

- Lado dueño: `users.common_person_id` (lo usan `getDoctorIdForUser`, el login y los filtros por médico). `CommonPerson.user` queda como lado inverso, sin `@JoinColumn` ni columna `userId`.
- Migración `1790386160686-SingleUserPersonLink`: aborta si hay divergencias; completa `users.common_person_id` desde `persona_comun.user_id` cuando solo existía ese lado (mueve datos; 0 filas hoy); borra `FK_64ad633807ee33a92952c382bc5`, `UQ_64ad633807ee33a92952c382bc5` y la columna `persona_comun.user_id`. `down()` recrea la columna y la rellena desde `users` (probado en la copia: 15 de 15 vínculos restaurados).
- `user.create` ya no escribe `persona_comun.user_id`; si la persona ya tiene usuario, el índice único de `users.common_person_id` responde 23505 → 409 (el comentario anterior decía que "sobrescribía", y era falso). `user.remove` borra la persona por `users.common_person_id`.

| Verificación | Resultado |
|---|---|
| Divergencias antes (`persona_comun.user_id` vs `users.common_person_id`) | 0 |
| FKs entre `users` y `persona_comun` antes / después (`information_schema`) | 2 / 1 (`users.FK_e356baae93eb514f72144e6fc42`) |
| Médicos activos que se resuelven desde un usuario | 15 de 16; el restante no tiene usuario (alta por `/doctors`), no por divergencia |
| `migration:run` → `revert` → `run` (copia), `migration:generate` (ambas) | OK / sin cambios |

## M-24 — FKs clínicas a RESTRICT y tabla huérfana

- Antes de cambiar: ningún servicio borra físicamente pacientes ni doctores (búsqueda de `delete`/`remove` sobre sus repositorios y de `DELETE FROM patients|doctors`: 0 resultados); todos los borrados son lógicos.
- Migración `1790386338537-ClinicalFksRestrict` (generada): `medical_histories`, `recipes` y `medical_appointments` → `patients`/`doctors` pasan de `ON DELETE CASCADE` a `RESTRICT` (`ON UPDATE CASCADE` se conserva). Entidades actualizadas. No se tocaron las tablas puente (`patient_allergies`, `doctors_specialties`, horarios, etc.): no son historia clínica y su cascada es la esperada.
- Migración `1790386400000-DropOrphanDepartmentsDoctors` (a mano): borra `parametro.departments_doctors` solo si tiene 0 filas (aborta si no). `down()` la recrea con sus índices y FKs. Al ejecutar en la real: 0 filas. `public.departments_doctors` (13 filas, la que usa la entidad) no se toca.

| Verificación | Copia | Real |
|---|---|---|
| `DELETE` de un paciente con historia (`BEGIN … ROLLBACK`) | 23503 (`FK_346f79a6…`) | 23503 |
| `DELETE` de un doctor con citas | 23503 (`FK_b606c06e…`) | 23503 |
| `to_regclass('parametro.departments_doctors')` | null | null |
| `run` → `revert` ×2 (la tabla vuelve) → `run`; `migration:generate` | OK / sin cambios | sin cambios |

## M-25 — Altas de médico y paciente sin personas huérfanas

- `doctors.create`: especialidades, centros (ambos sin borrados) y licencia se validan **antes** de escribir; la persona (buscar por letra + documento o crear) y el doctor se guardan en una transacción. 23505 → 409.
- `patient.create`: alergias, enfermedades, medicamentos y `patientCode` se validan antes; persona, verificación de paciente activo, código y paciente van en una transacción. 23505 → 409.
- `PatientService` y `DoctorsService` reciben el `DataSource` (se ajustaron las specs que los construyen a mano).
- Tests `src/doctors/doctor-patient-create.spec.ts`: licencia duplicada → 400 y 0 filas nuevas en `persona_comun`; fallo al guardar el doctor o el paciente → la persona nueva se revierte; alergia inexistente → 400 sin persona; alta válida escribe ambas filas.

## Verificación de cierre de fase

| Chequeo | Resultado |
|---|---|
| `npm run build` | 0 errores, 0 advertencias |
| `npx jest` | **28 suites, 130 tests, todos verdes** (línea base anterior: 20 suites, 99 tests; +31). Primera corrida verde, sin commits de corrección |
| `migration:show` en la real | 7 migraciones aplicadas (`InitialSchema` por baseline + 6) |
| `migration:generate` en la real | Sin cambios (sin drift) |
| Base vacía + `migration:run` de las 7 → huella del esquema contra la real | **Idéntica** |
| Arranque `PORT=8020 BULL_BOARD_PORT=8021 node dist/main.js` | 187 rutas, "Nest application successfully started", 0 líneas de error; detenido después. Huella del esquema antes y después del arranque: idéntica (ya no hay `synchronize()`) |
| `rg "synchronize\(" src` | Solo comentarios |

**Checklist de verificación de afirmaciones** (skill `claim-verification-review`):

- Cada comentario que afirma un índice único se verificó en `pg_indexes` y con INSERT duplicado → 23505: `UQ_patients_common_person_active`, `UQ_permisos_menus_rol_menu_permiso_active`, los seis de M-21, `UQ_bae767a5…` (citado en `finish-consultation.spec.ts`, p9 del documento de verificación) y `UQ_e356baae…` (citado en `user.create`, presente en `pg_indexes`). Los dos pendientes (M-18, M-19) se probaron en copias depuradas y se dejó constancia de que no están activos.
- Validaciones nuevas contra los datos: búsqueda por letra + documento (0 personas sin letra); nombre de especialidad sin mayúsculas (0 grupos en 71); índices nuevos (0 duplicados en cada tabla antes de aplicarlos). No hay seeder en el repo.
- Ningún método nuevo con dos transacciones: `finishConsultation`, `recipe.create/update`, `doctors.create` y `patient.create` usan una sola.
- Todos los tests nuevos instancian el servicio real (repositorios en memoria o simulados); ninguno lee el fuente ni reimplementa la lógica.
- Sin endpoints nuevos (no aplica el chequeo de permisos por módulo).

## Qué quedó fuera

- **M-18 paso 1 y 2, M-19 depuración e índices**: esperan decisión de producto (datos arriba). Migraciones en `src/database/migrations-pending/`.
- **M-16**: es del frontend.
- `Dockerfile`: no corre `migration:run:prod` antes de arrancar. Se dejó al despliegue para no cambiar el contenedor sin probarlo.
- `user.update` escribe `users` y `persona_comun` sin transacción (previo a esta fase; M-25 cubre altas).
- Mutaciones de control (revertir cada fix y ver fallar su test) no se corrieron en esta fase para ahorrar tiempo; los tests afirman el efecto en datos (filas tras rollback), no llamadas.
- No se probó de punta a punta por HTTP (sin credenciales de prueba); el bloqueo `pessimistic_write` de `finishConsultation` solo se ejercitó con el `DataSource` en memoria.
- Índice de personas con letra `NULL` (ver M-18, límite conocido).

## Pendiente para otros

- **Producto**: elegir la persona a corregir y su documento correcto (M-18) y el código nuevo de mastología (M-19); luego correr los scripts y activar las migraciones pendientes según los pasos de cada sección.
- **Despliegue**: seguir el procedimiento de M-13 (baseline una vez + `migration:run:prod`).
- **Frontend**: `docs/info/2026-09-25-fase-1-integracion-frontend.md` (409 de documento, 404 de referencias, reintento del cierre).
- Bases de trabajo creadas en el servidor local: `bd_gestion_medica_f1` (copia con todas las migraciones), `bd_gestion_medica_f1_empty` y `bd_gestion_medica_f1_fresh`. Se pueden borrar cuando no hagan falta.

## Actualización — M-18 y M-19 aplicados (decisión del usuario: la base es de prueba)

- **M-18**: sin fusión. El documento de `d53ebb57-acd5-4786-986d-6436f62df52c` pasó a **V-990000001** (verificado libre antes). Script `2026-09-25-depurar-persona-comun-duplicada.sql` ejecutado en la real: grupos duplicados 1 → 0. Migración `1790399000000-PersonaComunUniqueDocument` movida al glob y aplicada; `CommonPerson` declara el `@Index` parcial.
- **M-19**: "mastología" (`fc6618f2-a886-4396-a269-6cc4792daa59`) recodificada a **MS** (verificado libre). Script `2026-09-25-depurar-especialidad-mt.sql` ejecutado: códigos repetidos 1 → 0, nombres repetidos sin mayúsculas 0. Migración `1790399100000-SpecialtiesUniqueCodeAndName` aplicada; `Specialty` declara `UQ_specialties_code_active` y `UQ_specialties_name_lower_active` (este con `synchronize: false`, por ser índice de expresión). `specialty.service` traduce 23505 → 409.
- Respaldo previo a estos dos cambios: `backups/bd_gestion_medica_pre_fase1_cleanup_20260925-215401.dump`.

| Prueba en la real (`BEGIN … ROLLBACK`) | Resultado |
|---|---|
| INSERT de persona con (letra, documento) activo repetido | 23505 `UQ_persona_comun_documento_activo` |
| Mismo documento con otra letra | OK |
| Especialidad con código `MT` repetido | 23505 `UQ_specialties_code_active` |
| "Mastología" con "mastología" existente | 23505 `UQ_specialties_name_lower_active` |
| `migration:generate` después | Sin cambios |

Con esto `src/database/migrations-pending/` queda vacío y los dos índices están activos: el 409 de documento duplicado ya no depende solo de la validación en el servicio.
