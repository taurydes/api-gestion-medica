# 2026-10-04-005 — Bloque de mejoras restantes del backend

## Qué se pidió

Implementar en `api-gestion-medica` (rama `dt/modules`) todas las mejoras de
`app-gestion-medica/docs/plans/2026-10-04-mejoras-detectadas-hu.md` que no estaban resueltas y cuya
corrección es de backend (o la parte backend de las mixtas), más dos puntos explícitos:

- El cupo diario (`maxDailyAppointments`) se leía del primer bloque del día.
- MJ-24: sin centro no se validaban horario, turnos ni cupo.

Un agente de frontend trabaja en paralelo; el selector de turnos consumirá `GET /availability`.

## Bitácora

| Commit | Contenido |
|---|---|
| `a8f71e7` | MJ-24 + cupo diario: centro obligatorio al agendar y reprogramar, médico asignado al centro, cupo = suma de los bloques del día |
| `e03fa2e` | MJ-08 `GET /permissions/role/:roleId` por rol; MJ-09 matriz en una transacción (`test/in-memory-db.ts`: `failSaves(…, after)` y `count`) |
| `6529edc` | MJ-07 borrado lógico de roles; 409 si tiene usuarios vivos, 400 si es del sistema; migración `RolesNameUniqueActive1790520000000` (índice parcial) |
| `c712418` | MJ-05 `PATCH /users/:id/reset-password`; MJ-11/MJ-46 política única de 8 caracteres; MJ-03 la persona sobrevive si es paciente o médico vivo |
| `87efbb3` | MJ-01 bloqueo por credencial (5 fallos / 15 min → 429); MJ-06 `isAdmin` y `mustChangePassword` en `/auth/me` |
| `84d7605` | MJ-50 cierre con `medical-history.crear` e historia `completed`; MJ-31 `requestedExams` (jsonb, migración `MedicalHistoryRequestedExams1790520100000`); MJ-41 historia por paciente sin borrados |
| `b21c63d` | MJ-04 y MJ-47: migración `StaffGrantsAdjust1790520200000` (retira `user.*` a `medico` y `user.actualizar` a `enfermero`; da `parameters.consultar` a `enfermero`) |
| `f845961` | MJ-10: migración `AiMenusVisible1790520300000` (bandeja y detector visibles, con URL propia) |
| `2aa8053` | MJ-12 borrados con citas abiertas → 409; MJ-15 retiro de médico limpia departamentos y horario del centro; MJ-13 ids inexistentes → 400; MJ-17 solo admin cambia centros del médico |
| `6560034` | MJ-14 `departments.supports_mammography` (migración con relleno desde la regla de nombre) |
| `73c7b6f` | MJ-20/21/22/02 alcance de pacientes por médico o por centros del personal; `by-document` sin borrados ni datos clínicos; filtro `isActive` y orden por apellido |
| `f69dd5b` | MJ-23 `birthDate` y `sex` en la persona (migración `PersonBirthDateAndSex1790520500000`); MJ-48 estado civil cerrado y mensajes en español |
| `05dfa51` | MJ-33 `doctorAgreement`/`reviewAgreement`; MJ-34 segunda revisión → 409; MJ-37 `DELETE` con motivo; MJ-44 un análisis vivo por archivo (migración `MammographyAgreementAndSingleAnalysis1790520600000`) |
| `5b70052` | MJ-36 etiquetas neutras guardadas por la API |
| `f72f485` | MJ-38 panel del personal por centros; MJ-45 cifras acotadas y análisis contados desde `mammography_analyses` |
| `8261993` | MJ-43 dueño de la foto verificado; MJ-46 foto propia solo con sesión |
| `575b4de` | MJ-42 barrido de conversiones DICOM de más de 24 h |
| `bae8c4a` | MJ-49 `/health` con Redis y detector |
| `50bed73` | MJ-39 bitácora `auditoria.access_log` (migración `AccessLog1790520700000`) y `GET /audit/access-log` |
| `90a2a51` | Dos specs viejas alineadas (matriz del panel, borrado de paciente con alcance): `73c7b6f` y `f72f485` las dejaron en rojo porque no se corrió la suite completa antes de esos commits |
| `6ef7922` | Cita sin centro: un solo mensaje (salían dos, uno en inglés de `@IsUUID`); encontrado en la verificación por API |
| `738186d` | Foto del alta de usuario: se mueve de la carpeta del administrador a la del usuario nuevo (reportado por el agente de frontend) |
| det `564458b` | MJ-36 en el detector (`detector-cancer-de-mama`, rama `dt/modules`): etiquetas neutras; `prediction` y puntajes sin cambios; 30/30 tests en la etapa `test` del Dockerfile; imagen reconstruida |
| app `ced3064` | Plan de mejoras consolidado (con la tabla del frontend, `docs/tasks/2026-10-04-006-…`) y Brechas de las HU |

## Decisiones

| Decisión | Por qué |
|---|---|
| Cupo diario = **suma** de `maxDailyAppointments` de los bloques activos del día en el centro | El campo vive en el bloque y la pantalla de horario lo conserva por bloque (`app` `f47efc1`); no hay un campo de médico ni una pantalla que lo edite. La suma no depende del orden de los bloques. Hoy ningún médico tiene dos bloques el mismo día en el mismo centro (consulta en la base), así que el valor efectivo no cambia |
| `medicalCenterId` **obligatorio** al agendar (400) y al reprogramar una cita sin centro (400) | Horario, turnos y cupo se configuran por centro; validar "contra cualquier bloque del día" no dice en qué centro estará el médico ni qué grilla de turnos aplica. En la base hay **0** citas sin centro (todas las vivas lo tienen), el seed siempre lo envía y el selector de turnos necesita el centro para `GET /availability` |
| El médico debe estar asignado al centro (400) | Un bloque en un centro del que el médico salió (MJ-15) seguiría aceptando citas |
| `GET /availability`: con el día lleno, todos los `slots` salen `available: false` | Misma forma; evita que el selector ofrezca un turno que el cupo diario rechazaría |
| MJ-24 reprogramación: una cita sin centro (heredada) pide centro (400) en vez de validarse "sin centro" | Coherente con el alta; hoy no hay ninguna |
| MJ-07: rol con usuarios vivos → 409; roles del sistema (`superusuario`, `medico`) → 400 | Borrar un rol asignado dejaba a sus usuarios sin acceso (la API los trata como inactivos); antes la FK hacía fallar el borrado físico con 500 |
| MJ-07: el índice único de nombre pasa a parcial (`deleted_at IS NULL`) | Con borrado lógico, un rol borrado no debe reservar su nombre |
| MJ-05: el restablecimiento lo hace un administrador con una contraseña temporal que él define (no se genera ni se envía por correo) | No hay servicio de correo operativo (la cola `email` no tiene productor, MJ-49). `firstLogin = true` + `mustChangePassword` en `/auth/me`; cambiar la contraseña lo vuelve a `false`. Permiso: `role.actualizar`, la misma regla de "administración" que cambiar rol o centros. La propia cuenta → 400 (usar `/auth/change-password`) |
| MJ-05 datos: 18 cuentas tenían `first_login = true` sin efecto → `false` | Si no, la regla nueva les exigiría un cambio que nadie pidió. Script `docs/info/migrations/2026-10-04-usuarios-first-login.sql` (18 filas; 2.ª corrida 0) |
| MJ-11/MJ-46: 8 caracteres para toda contraseña **nueva** (alta, alta de sistema, cambio, restablecimiento); el login sigue aceptando 6 | El front ya exigía 8 en el perfil; cuentas antiguas con 6–7 caracteres deben poder entrar para cambiarla |
| MJ-11: sin pantalla de usuarios de sistema | Hay una sola cuenta de sistema y se gestiona por API; una pantalla no aporta a la tesis. Se cierra con la validación |
| MJ-03: la persona solo se borra si no es paciente ni médico vivo | Alternativa "desvincular sin borrar" deja personas huérfanas sin nada que las use |
| MJ-01: clave = credencial escrita (normalizada), no el id del usuario; 429 | Así una credencial inexistente se bloquea igual y el 429 no revela qué cuentas existen. Costo: un tercero puede bloquear 15 min una cuenta ajena; aceptable frente a la fuerza bruta. TOTP queda fuera (requiere enrolamiento y pantalla) |
| MJ-50: permiso del cierre = `medical-history.crear`; historia creada `completed` | El cierre escribe el registro clínico. La interfaz no edita historias (no hay pantalla de `PATCH /medical-history`), así que bloquear la edición de historias cerradas no rompe ningún flujo. Datos: 224 historias `in_progress` de citas `completed` → `completed` (`docs/info/migrations/2026-10-04-historias-cerradas-completed.sql`, 2.ª corrida 0) |
| MJ-31: columna `requested_exams jsonb` (lista `{ name, notes? }`, máx. 30) en vez de tabla de órdenes | No hay flujo de resultados de exámenes que justifique una tabla; el front ya los guardaba como texto en `treatmentPlan` (`app` `5f4d1cd`) y podrá enviarlos estructurados |
| MJ-41: preventiva | En la base hay 0 historias borradas; el filtro evita que reaparezcan |
| MJ-04: se retira `user.consultar`/`user.actualizar` a `medico` y `user.actualizar` a `enfermero` | El perfil propio va por `/auth/profile`, `/auth/me` y `/auth/change-password`. Efecto lateral: el layout del front pedía `GET /users/:id` para la foto del usuario; debe usar `GET /auth/profile` (`imageUrl`) — documentado en la guía |
| MJ-47: solo `parameters.consultar` | Es lo que pide el formulario de paciente (alergias, enfermedades, medicamentos) |
| MJ-10: dos entradas ("Bandeja de análisis IA" y "Detector IA") bajo la sección clínica, con `url` propia | El sidebar del front usa `item.url` cuando no es `#`, así que no necesita mapeo nuevo. Visibles para quien tenga algún permiso sobre esos menús (`superusuario`, `medico`) |
| MJ-12: "cita abierta" = `pending`/`confirmed` futura, o `in_consultation` | Rechazar (409) en vez de cancelar en cascada: cancelar citas ajenas exige un motivo y avisar al paciente, decisión humana |
| MJ-15: al retirar un médico del centro se **borran lógicamente** sus bloques de ese centro (no solo se desactivan) | `assertNoOverlap` cuenta los bloques inactivos de cualquier centro; uno desactivado en un centro abandonado impediría horarios en otro |
| MJ-17: cambiar centros de un médico exige administrador (403); reenviar los mismos centros pasa | El formulario de edición reenvía la lista actual. Quitar un centro por `PATCH /doctors/:id` aplica la misma limpieza que MJ-15 |
| MJ-13: 400 con los ids inexistentes (departamentos y edición de médico), también si están borrados | Mismo criterio que el alta del médico |
| MJ-14: `supportsMammography` sembrado con la regla que reemplaza (`mamograf`/`mastolog`) | Ninguna pantalla cambia de comportamiento al desplegar; luego el nombre deja de decidir |
| MJ-02/MJ-20/MJ-21: alcance de pacientes = registrados por el usuario **o** con cita del médico / en los centros del personal | El personal no médico queda acotado por `users_medical_centers`; sin centros, solo ve lo que registró. `by-document` queda **sin acotar** pero sin alergias, enfermedades ni medicación: es la búsqueda para agendar un paciente registrado por otro |
| MJ-02 se aplica a pacientes (único módulo de lectura del enfermero) | Citas, historias y panel no tienen hoy roles no médicos con permiso; el panel del personal (MJ-38) usa el mismo alcance |
| MJ-23: `sexo` F/M con CHECK en vez del catálogo `parametro.genero` | El catálogo está **vacío** (0 filas) y el dato que importa para el cribado es el sexo biológico, un conjunto cerrado. El seed lo carga de forma determinista (no consume el generador aleatorio) |
| MJ-48: estado civil cerrado con `@IsIn` (los 5 valores del formulario); catálogos públicos se mantienen | Todos los datos existentes ya están en ese conjunto. `/gender` y `/civil-status` están vacíos; `/state`, `/municipality`, `/parish`, `/identity-document` tienen datos y sirven a un futuro formulario de dirección. Retirarlos no aporta y no los usa nadie |
| MJ-33: acuerdo en dos columnas (`doctor_agreement` del que atiende, `review_agreement` del revisor) con CHECK | Medir concordancia médico–modelo sin parsear texto. Relleno de 20 análisis desde `notes`; la nota de revisión era libre y no se infiere |
| MJ-34: 409 en vez de historial de revisiones | Conserva quién revisó primero sin tabla nueva; la interfaz solo ofrece revisar lo no revisado |
| MJ-37: implementar el borrado (lógico, con motivo y `deleted_by`) en vez de retirar el permiso | Con MJ-44 un archivo admite un solo análisis vivo: sin retiro no habría forma de corregir uno hecho sobre la imagen equivocada. Revisado → 409 (es parte del registro) |
| MJ-44: un pedido repetido **devuelve** el análisis existente (no 409) | Idempotente ante reintentos del front; la carrera la resuelve el índice único (23505 → se devuelve el ganador). Datos: 3 archivos duplicados → se dejó el más reciente; la migración repite el dedupe para no fallar en otra base |
| MJ-36: normaliza la API y también el detector | Doble defensa: un detector viejo no vuelve a meter BI-RADS en la base. Se alinearon 94 etiquetas y su `raw_response` |
| MJ-38/45: el panel acepta `patient.consultar`; personal acotado por centros (`scope: centers`); recetas del personal = 0 | Las recetas no tienen centro y el enfermero no las ve en ningún otro lado |
| MJ-43: foto de persona = propia, paciente editable o administrador; de médico = el propio o administrador | Reutiliza el alcance de pacientes de MJ-21, sin regla nueva |
| MJ-42: barrido con `setInterval` en el servicio (24 h, cada hora) | No hay `@nestjs/schedule`; agregarlo por un barrido no compensa |
| MJ-49: Redis y detector en el health; `emailQueue` se conserva | Bull Board es la herramienta de HU-13.2; retirar la cola tocaría el módulo de colas entero sin beneficio |
| MJ-39: escrituras exitosas y lecturas clínicas, sin cuerpo ni query string; la inserción no bloquea la respuesta | La query puede llevar nombres o documentos; un fallo de la bitácora no debe tumbar la operación clínica |
| MJ-35: `/inbox` se conserva | El front resolvió revisar desde la bandeja con `/recent`; `/inbox` no expone nada extra |
| Foto del alta de usuario: se mueve en el backend, sin cambiar el front | El formulario sube antes de crear la cuenta; moverla tras el commit corrige a cualquier cliente. 0 fotos mal ubicadas en la base (no hizo falta script) |
| Detector: commit en `dt/modules` de su repo | Pedido del coordinador; la rama estaba igual a `devel` |

## Verificación

| Qué | Resultado |
|---|---|
| `npx tsc -p tsconfig.build.json --noEmit` antes de cada commit | 0 errores |
| `npx jest --ci` | **574/574** (baseline 432; +142). Specs nuevas que invocan el servicio real: `booking-center-and-daily-cap`, `role-permission-matrix`, `role-soft-delete`, `user-remove-and-reset`, `auth.service` (bloqueo), `auth-me-centers`, `finish-consultation` (MJ-50/31/41), `open-appointment-guards`, `department-mammography-flag`, `patient-scope`, `patient-identity-fields`, `mammography-analysis.rules`, `detector.client` (etiquetas), `dashboard-scope`, `photo-access`, `dicom-cleanup`, `dependencies.health`, `access-log.interceptor`, `profile-photo-relocate` |
| `npm run build` | 0 errores / 0 advertencias |
| Migraciones (7 nuevas) | Cada una `run` → `revert` → `run`; `migration:generate --dryrun --check` → "No changes in database schema were found" tras cada una y al final |
| Contenedores | `medos-backend` reconstruido (la última vez con `738186d`): "No migrations are pending"; `medos-ml-api` reconstruido con `564458b`; `/health` → database, memory, redis y detector `up` |
| Cache | Claves `permission:*` borradas en Redis tras las migraciones de permisos y menús |
| Detector | 30/30 tests (`docker build --target test`) |
| API (`verify-block.js` en el scratchpad; `cmendoza`, `rparedes`, `admin.caracas`, `enf.ramirez`) | **81/81** |

Casos API: MJ-06 `isAdmin` admin/médico; MJ-05 restablecer → login con la temporal → `mustChangePassword` true → cambiar → false; médico no restablece (403); admin sobre sí mismo (400). MJ-10 menús del médico con nombre y URL; el enfermero sin ellos. MJ-04 `/users` 403 para médico y enfermero; `/auth/profile` 200. MJ-47 enfermero `/allergies` 200. MJ-08 por rol 200 / inexistente 404. MJ-07 borrado lógico, nombre liberado, rol con usuarios 409, `medico` 400. MJ-46/11 contraseñas de 7 y 1 caracteres → 400. MJ-03 usuario y paciente con la misma persona → borrar el usuario deja la persona. MJ-01 5×401 y luego 429. MJ-24 sin centro (un mensaje) y centro ajeno → 400; reserva en un turno libre de `availability` → 201. Cupo diario: cupo 2 con 2 citas → `availability` todo cerrado y 400 "máximo de 2"; con un bloque extra de cupo 1 la tercera entra y la cuarta da "máximo de 3". MJ-12 centro, departamento y paciente con citas abiertas → 409. MJ-15 retirar médico con citas → 409 sin cambios. MJ-17 agregarse un centro → 403; mismos centros → 200. MJ-13 especialidad inexistente → 400. MJ-14 `supportsMammography` en el detalle. MJ-23 alta con fecha y sexo; sexo X y fecha futura → 400. MJ-20 el médico encuentra y abre al paciente que registró. MJ-21 otro médico `PATCH`/`DELETE` → 403; `by-document` sin listas clínicas. MJ-48 estado civil libre → 400; 404 en español. MJ-22 `isActive=false` y orden por apellido. MJ-02 el enfermero lista menos pacientes, 403 fuera de su centro, 200 dentro. MJ-38 panel del enfermero (`scope: centers`). MJ-45 `totalMlAnalyses` = conteo en la base y 1 centro. MJ-50 cierre → historia `completed`; enfermero → 403. MJ-31 exámenes estructurados. MJ-33 acuerdos guardados. MJ-36 etiqueta neutra en la API y en la respuesta cruda del detector. MJ-44 segundo análisis = mismo id. MJ-34 segunda revisión 409. MJ-37 revisado 409, otro médico 403, sin motivo 400, propio 204 con motivo y autor. MJ-41 historia borrada fuera del listado. MJ-43 fotos ajenas → 403. MJ-46 el enfermero sube y ve su foto. Foto del alta de usuario en la carpeta del usuario nuevo (la ruta del admin → 404). MJ-39 la bitácora tiene escrituras y lecturas del médico; el enfermero → 403. MJ-49 health.

Limpieza: citas, historias, archivos (filas y físicos), análisis, pacientes, personas, usuarios, roles y fotos de prueba borrados; bloque temporal borrado y cupo del martes restaurado a 16; claves `login-fail:*` y caches borradas; filas de `auditoria.access_log` de la corrida borradas. También se borró la cita **cancelada** `c3b1d5f2-…` que dejó la verificación del agente de frontend (sin historia ni archivos).

## Lo que quedó fuera

- **MJ-40** parcial: la evaluación del modelo necesita casos etiquetados (no existen en el proyecto).
- **MJ-01**: TOTP (requiere enrolamiento y pantalla).
- **MJ-24**: el departamento de la cita no se verifica contra el médico.
- **MJ-05**: no hay recuperación de contraseña por correo (no hay servicio de correo).
- `GET /medical-appointments` para personal no médico no se acota por centro (ningún rol no médico tiene hoy ese permiso).
- Las reglas de negocio (RN) de las HU no se reescribieron: solo las Brechas.

## Pendiente para otros

- **Front (MJ-04)**: el layout pide la foto con `GET /users/:id`, que ahora da 403 a médico y enfermero; debe usar `GET /auth/profile` (`imageUrl`).
- Opcional: pantalla para `GET /audit/access-log`.
- Guía: `docs/info/2026-10-04-mejoras-bloque-integracion-frontend.md`. Scripts de datos (corridos dos veces; la segunda, 0 filas): `docs/info/migrations/2026-10-04-usuarios-first-login.sql`, `…-historias-cerradas-completed.sql`, `…-analisis-duplicados-y-acuerdo.sql`, `…-analisis-etiquetas-neutras.sql`.

## Correcciones tras el QA (2026-10-04)

Pedido: cerrar los hallazgos H-01..H-07 de `docs/QA/2026-10-04-bloque-mejoras-qa.md` y re-probar en vivo cada caso FAIL.

### Bitácora

| Hallazgo | Qué se hizo | Commit |
|---|---|---|
| H-01 (ALTA) carrera de capacidad | `validateBooking` corre **dentro** de la transacción de `create` y de `update`, después de `SELECT pg_advisory_xact_lock(hashtext('<doctorId>:<YYYY-MM-DD local>'))`; los conteos de turno y cupo diario usan el repositorio del `manager` (la conexión que tiene el bloqueo). `update` pasó a transacción (antes guardaba con el repositorio suelto). | `8ac4d94` |
| H-02 (MEDIA) 500 en `availability`/`available-dates` | DTOs `AvailabilityQueryDto` / `AvailableDatesQueryDto` (`@IsUUID`, `@Matches(YYYY-MM-DD)` + `@IsDateString({ strict: true })`) con `@Query()`; `22-12-2026`, `basura` y un ISO con hora dan 400. | `fbdaab1` |
| H-03 (MEDIA) PATCH con centro inexistente | En `update`, si viene `medicalCenterId`, se busca el centro (404) antes de `assertDoctorInCenter` (400), como en `create`. | `fbdaab1` |
| H-06 (BAJA) textos sin tope | Columnas `text` → el tope vive en los DTOs: `reason` 500, `observations` 2000 (también en `CompleteConsultationDto`), `cancellationReason` 500. | `fbdaab1` |
| H-04 (MEDIA) BI-RADS en `rawResponse` | El script anterior reescribió `raw_response->label` pero no el anidado `raw_response->raw->label`. Nuevo script `2026-10-04-raw-response-etiquetas-neutras.sql` (24 filas; 2.ª corrida 0) y `neutralizeLabels()` en `findOne` (único camino que expone `rawResponse`). | `f111ecf` |
| H-05 (BAJA) HU-07.2 desfasada | RN-08 y CA-07 describen ahora el 400 de MJ-28; fecha de corrección en el encabezado. | `app` `d8a15e2` |
| H-07 (BAJA) cobertura | Sin cambio de código: ver Decisiones. | — |

### Decisiones

- **Bloqueo consultivo, no índice único ni SERIALIZABLE.** La regla es "N pacientes por turno con duraciones que se solapan" más un cupo diario por centro: no se expresa como restricción única. `SERIALIZABLE` obliga a reintentar ante 40001 en todos los clientes. `pg_advisory_xact_lock` por médico y día serializa solo las reservas que compiten (otro médico u otro día no esperan), se libera con la transacción y no deja estado si el proceso muere. La clave lleva el día local porque el cupo diario se cuenta por día local; el solape con otro centro cae en la misma clave (mismo médico y día).
- **La validación completa se movió dentro de la transacción** (antes de `resolvePatient`): la cita rechazada por turno lleno se decide con el bloqueo tomado y antes de escribir el paciente; si fallara después, el rollback deja 0 personas (MJ-25 sigue: caso ABU-04e). Se descartó mantener además la validación previa fuera de la transacción: duplicaba 4 consultas por reserva sin aportar garantía.
- **Prueba unitaria de la serialización.** `InMemoryDb` modela el bloqueo como un mutex por clave que, al concederse, refresca la vista de la transacción con lo confirmado (READ COMMITTED); rechaza un bloqueo pedido después de escribir; `getMany`/`getCount` devuelven toda la tabla (los filtros no se interpretan: un médico/día por tabla). `booking-concurrency.spec.ts` lanza 6 `create` concurrentes contra los validadores reales (turno y cupo), 2 `update` al mismo turno, verifica el orden bloqueo → conteo → inserción y un control sin bloqueo (6 aceptadas). **La prueba real es el re-test contra la API** (§9 del QA).
- **`finishConsultation` no toma el bloqueo**: cierra una cita existente, no crea ni mueve citas.
- **H-04 en lectura solo en `findOne`**: `serialize()` (listados) no expone `rawResponse`. Las 8 menciones de "BI-RADS" que quedan en `GET /mammography-analyses/recent` de junio 2026 están en `reviewNotes` (texto libre de la médica: "BI-RADS 4C", "BI-RADS 3"); son datos de usuario y no se tocan, como ya decía el QA.
- **H-07**: el alcance de escritura de personal no médico sobre pacientes sigue sin ejercitarse porque ningún rol del ambiente tiene `patient.actualizar`/`patient.eliminar` sin ser médico ni administrador; el 403 que ve el enfermero es por permiso, no por alcance. Queda como observación de cobertura, no como defecto.

### Verificación

| Qué | Resultado |
|---|---|
| `npx tsc -p tsconfig.build.json --noEmit` antes de cada commit | 0 errores |
| `npx jest --ci` | **620/620** (79 suites; baseline 592, +28: `booking-concurrency` 5, `request-validation` 18, `booking-center-and-daily-cap` +1, `neutral-labels` 4). `cache-invalidation.spec` necesitó el `dataSource` falso porque `update` ahora abre transacción; los specs con repositorios simulados usan `test/fake-data-source.ts`. |
| `migration:generate --dryrun --check` | "No changes in database schema were found" |
| Script de datos | `2026-10-04-raw-response-etiquetas-neutras.sql`: 24 filas (19 BENIGN, 5 MALIGNANT); verificaciones 0 / 0 / 0; 2.ª corrida 0 |
| Contenedor | `medos-backend` reconstruido con el árbol de `f111ecf`, `healthy`; `/app/dist` contiene `pg_advisory_xact_lock` y `neutralizeLabels` |
| Re-test en vivo | 12 ráfagas de 6 `POST` paralelos (6 al mismo turno de capacidad 1 y 6 a turnos distintos de un día con cupo 1): **12/12 con exactamente 1 cita en BD y 5 × 400**; H-02 5/5 → 400 (caso válido 200); H-03 → 404; H-06 3/3 → 400 y 0 personas huérfanas; H-04 0 etiquetas con BI-RADS en API y SQL. Detalle en `docs/QA/2026-10-04-bloque-mejoras-qa.md` §9. |
| Limpieza | `cleanup.sql`: 321 citas (= inicio), 0 personas/pacientes/médicos `QA%`, 0 horarios huérfanos; 0 `appointment_number` duplicados |

### Fuera / pendiente

- Front: `maxlength` 500 / 2000 / 500 en el formulario de cita (guía actualizada).
- El re-test usó un médico de prueba insertado por SQL (persona `QA9000001`), no los médicos demo; `cmendoza` no se tocó.
