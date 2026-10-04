# 2026-10-04-004 — Alcance por médico en las escrituras (MJ-16, MJ-18, MJ-27, MJ-32)

## Qué se pidió

Cerrar las cuatro mejoras ALTA de seguridad y datos detectadas en la ingeniería inversa de las HU
(`app-gestion-medica/docs/plans/2026-10-04-mejoras-detectadas-hu.md`), reutilizando la regla de
administrador ya existente (`AuthContextService.getScopedDoctorId` / `isAdmin`, permiso
`security.consultar`):

- **MJ-16** un médico podía dar de baja a cualquier médico.
- **MJ-18** un médico podía reescribir el horario de otro.
- **MJ-27** escrituras de citas e historias sin acotamiento; `PATCH /medical-history/:id` podía mover la historia.
- **MJ-32** la subida de archivos de cita tomaba el paciente del cuerpo.
- Brechas de estado: `PATCH /:id/complete` completaba sin historia; `finish-consultation` aceptaba `pending`.

Más: adaptar el frontend, actualizar HU, el documento de mejoras y una guía de integración.

## Qué se hizo

| Commit | Repo | Contenido |
|---|---|---|
| `a2652b2` | api | `AuthContextService.assertDoctorScope` / `assertAdmin`; baja y (des)activación de médicos solo para administradores; horarios acotados al dueño; `DELETE /doctors/schedules/:blockId` pasa a `doctors.actualizar`; migración `RevokeDoctorDeleteFromMedico1790510000000` |
| `be94683` | api | Escrituras de citas acotadas al médico de la cita (y sin reasignar a otro médico); `finish-consultation` rechaza `pending`; se retira `PATCH /:id/complete` |
| `8caec14` | api | Escrituras de historias acotadas; `PATCH` rechaza `patientId`/`doctorId`/`medicalAppointmentId`; `POST` con cita exige su paciente y médico |
| `b71d517` | api | `AppointmentUploadTargetService`: paciente, centro e historia de la subida se derivan de la cita; análisis toma el paciente de la cita (409 si el archivo no coincide) |
| `cafa23e` | app | "Eliminar Doctor" visible solo con `doctors.eliminar` **y** `security.consultar` |

## Decisiones

| Decisión | Por qué |
|---|---|
| Borrar o (des)activar médicos es **solo de administradores**, ni siquiera el propio médico | Una baja saca al médico de listados, citas y asignaciones; es una decisión de gestión, no de perfil. El médico sigue editando sus datos |
| `isActive` en `PATCH /doctors/:id` solo da 403 si **cambia** el valor | El formulario de edición reenvía el valor actual; rechazarlo siempre rompía la edición del propio perfil |
| `doctors.eliminar` se retira al rol `medico` con migración (soft delete del grant, `down` lo vuelve a insertar) | Además de la baja de médicos, solo habilitaba borrar bloques de horario; ese endpoint pasa a `doctors.actualizar` (borrar un bloque es editar el horario, igual que `POST /schedules`, que ya borraba bloques con `actualizar`) |
| `doctors.crear` se deja en `medico` | No afecta a otros médicos; fuera del alcance pedido |
| Personal sin perfil de médico no se acota por médico en las escrituras | Misma semántica que la lectura (`getScopedDoctorId` = `null`). Verificado en la base: `enfermero` solo tiene `patient.consultar/crear`; ningún rol no médico escribe citas, historias ni horarios. El acotamiento por centro es MJ-02 |
| Recepción "confirmando llegada" | No existe hoy un rol de recepción con `appointments.actualizar`; con la regla elegida, uno futuro sin perfil de médico podría confirmar cualquier cita |
| Un médico no puede reasignar su cita a otro médico (`doctorId` ajeno → 403) | Si no, sacaría la cita de su alcance y escribiría la agenda de otro |
| Se **retira** `PATCH /:id/complete` en vez de exigir historia | Ni la interfaz ni `scripts/seed-demo.js` lo usan (grep en `app/src` y `scripts`); `completed` queda solo por el cierre de consulta |
| `finish-consultation`: `pending` → 400, mensaje propio | Se mantienen los mensajes existentes de `completed` y `cancelled`; enum real: `confirmed`, `in_consultation` |
| La historia creada por `finish-consultation` no repite el chequeo de alcance | El cierre ya validó al usuario contra la cita bloqueada; `create` solo lo hace sin `manager` (llamada directa a `POST /medical-history`) |
| Subida: los valores del cuerpo se aceptan si coinciden, 400 si contradicen | La interfaz y el seed los envían; ignorarlos en silencio ocultaría un error del cliente |
| Cita sin centro → carpeta `general` | Antes la interfaz enviaba `medicalCenterId: ''` y la subida fallaba con 400 en esas citas |
| Archivo con paciente distinto al de la cita → 409 en el análisis | No propagar datos incoherentes anteriores; en la base hay 0 casos |
| La lógica de la subida va en un servicio nuevo de `files`, no en `FilesService` | `FilesService` es la primitiva de almacenamiento usada por varios módulos; así no gana dependencias de citas e historias |

## Verificación

| Qué | Resultado |
|---|---|
| `npx tsc -p tsconfig.build.json --noEmit` antes de cada commit | 0 errores |
| `npx jest --ci` | **395/395** (baseline anterior 341; +54 de esta tarea y specs existentes ajustadas) |
| Specs nuevas que invocan el servicio real con `AuthContextService` real (`test/auth-context-stub.ts` → `authContextForUsers`) | `doctor-scope.spec.ts`, `appointment-scope.spec.ts`, `finish-consultation.spec.ts` (bloque MJ-27), `medical-history-scope.spec.ts`, `appointment-upload-scope.spec.ts` (controlador + `FilesService` real sobre disco temporal), `mammography-analysis.create.spec.ts` (409). Cada regla: médico A sobre B → 403 sin cambios; propio → ok; admin → ok |
| Migración `run` → `revert` → `run` local | OK; `migration:generate --dryrun --check` → "No changes in database schema were found" |
| Contenedor reconstruido | Aplica `RevokeDoctorDeleteFromMedico1790510000000` al arrancar; `medico` queda con `doctors.{actualizar,consultar,crear}` |
| Cache de permisos | Se borró la clave `permission:g0:access:role:…` en Redis (TTL 1 h) para que el retiro rija de inmediato |
| `npx ng build` / `npx ng test --watch=false --browsers=ChromeHeadless` | OK / **80/80** |
| API con `cmendoza` (A), `rparedes` (B) y `admin.caracas` | **49/49** casos esperados (1 omitido: A no tiene centro sin bloques para probar `POST /schedules` propio sin reemplazar datos demo; cubierto por unit test). Script: scratchpad `verify-scope.js` |
| Datos de prueba | Citas `QA-SCOPE-*` y bloques temporales insertados por SQL y borrados al final; el médico QA `qa_medico_f2_4245167` se dio de baja/desactivó por API y se restauró; archivos físicos de prueba borrados del volumen; caches de citas, historias y médicos limpiadas |
| `seed-demo.js --today` en el contenedor | Termina sin errores, pero **omitió** la agenda: `cmendoza` y `lgutierrez` ya tenían citas hoy. Sus llamadas (cierre por el médico de citas `confirmed` propias, subida con el `patientId`/centro/historia de la cita, cancelación por admin) se probaron con la misma forma en la verificación por API |

Casos API (resumen): baja de médico por A sobre B y sobre sí misma → 403; A cambia su `isActive` → 403; A edita su perfil reenviando `isActive: true` → 200; admin desactiva/reactiva/da de baja al médico QA → 200. Horario: A sobre bloque de B (`PATCH`, `DELETE`, `POST`) → 403; A sobre bloque propio → 200; admin sobre B → 200. Citas: A sobre cita de B (`PATCH`, `/confirm`, `/start-consultation`, `/cancel`, `/finish-consultation`, `DELETE`) → 403; A reasigna su cita a B → 403; A cierra su cita `pending` → 400; `/complete` → 404; flujo propio confirm → start → finish → 200; admin sobre B → 200. Historias: B `PATCH` historia de A → 403; A `PATCH` propia → 200, con `patientId`/`doctorId` → 400; A `POST` a nombre de B → 403; admin `PATCH`/`DELETE` → 200. Subida: A con `patientId` ajeno → 400; B a cita de A → 403; A con y sin `patientId` → 201, ambos archivos guardados con el paciente y la historia de la cita; admin a cita de B → 201.

## Segunda tanda (mismo día): cierre de lo que había quedado fuera

Pedido: cerrar MJ-19 (centro del horario), MJ-28, el resto de MJ-32, el alta a nombre de otro médico,
`doctors.crear` del rol `medico`, las 7 citas `completed` sin historia y el manejo de errores de la baja
de médicos en la interfaz.

| Commit | Repo | Contenido |
|---|---|---|
| `855cb01` | api | `setSchedule`: el centro debe ser uno de los del médico → 400 |
| `d3eebf2` | api | Recetas: escrituras acotadas al médico de la receta/historia; `POST` exige paciente, médico y cita de la historia; `PATCH` sin `medicalAppointmentId` |
| `cd41550` | api | `AppointmentFileAccessService` (renombrado desde `AppointmentUploadTargetService`): listar y descargar archivos de cita solo para su médico o un administrador |
| `7466074`, `07f3709` | api | `POST /medical-appointments`: un médico solo agenda a su nombre (403 antes de crear al paciente); el controlador pasa el usuario (`createdBy`) |
| `46512e8` | api | Migración `RevokeDoctorCreateFromMedico1790510100000` (con `down`) |
| `640d089` | app | `doctor-list` → `onDelete`: confirma la baja; los errores los muestra el interceptor |

| Decisión | Por qué |
|---|---|
| El centro del horario se valida también para administradores (400, no 403) | Es una regla de datos, no de alcance: un horario en un centro ajeno acepta citas donde el médico no trabaja. En la base había 0 bloques así |
| Recetas: mismo helper `assertDoctorScope`; dispensar también acotado | Hoy no hay rol de farmacia: dispensa el médico o un administrador (el seed dispensa como administrador) |
| Archivos: lectura acotada sin excepción para otros roles | Solo `superusuario` y `medico` tienen `file.consultar` (verificado en la base); el único consumidor es el detalle de la cita, ya acotado. Un rol futuro sin perfil de médico no se acota por médico, como el resto |
| Alta de citas: validar (403) en vez de forzar el `doctorId` | Forzarlo cambiaría en silencio lo que el cliente pidió. El `enfermero` no tiene `appointments.crear`, así que no hay flujo de recepción que preservar; la interfaz del médico ya solo le ofrece su perfil |
| Retirar `doctors.crear` a `medico` | Solo protege `POST /doctors`, que la interfaz no usa: el alta de médicos va por `POST /users` (`user.crear`, que `medico` no tiene). Los botones "Nuevo doctor" se ocultan por el permiso |
| Las 7 citas `completed` sin historia → `cancelled` con motivo, no historia inventada | Son pruebas de feb–mar 2026 (médicos `ysleidy`, `jean`, `daniel`; motivos sin contenido clínico), sin recetas ni archivos. Crear una historia fabricaría un registro clínico; `cancelled` es final y coherente. Script con verificaciones: `docs/info/migrations/2026-10-04-citas-completadas-sin-historia.sql` (corrido dos veces: 7 filas y luego 0) |
| `onDelete` no agrega un snackbar de error | El `errorInterceptor` global ya muestra el mensaje de la API en cada error (403 incluido, cubierto por `error.interceptor.spec.ts`); un segundo snackbar lo duplicaría. Se agregó la confirmación de éxito |

| Verificación | Resultado |
|---|---|
| `tsc` antes de cada commit | 0 errores |
| `npx jest --ci` | **416/416** (baseline 395) — specs nuevas en `doctor-scope.spec.ts` (MJ-19), `recipe-scope.spec.ts`, `appointment-upload-scope.spec.ts` (listar/descargar con `FilesService` real y archivo en disco), `appointment-scope.spec.ts` (alta) |
| Migración `run` → `revert` → `run` | OK |
| `npx ng build` / `ng test` | OK / **80/80** |
| Contenedores reconstruidos | `RevokeDoctorCreateFromMedico1790510100000` ya aplicada desde local ("No migrations are pending") |
| API (`verify2.js` en el scratchpad) | **21/21**: horario en centro no asignado → 400; `medico` `POST /doctors` → 403; A agenda para B → 403, para sí → 201, admin para B → 201; recetas de B por A (`PATCH`, `/dispense`, `/cancel`, `POST` sobre historia de B) → 403, admin `POST` con otro paciente → 400, B edita la suya → 200, admin dispensa → 200; A lista/descarga archivos de B → 403, B y admin → 200; 0 citas `completed` sin historia. Re-corrida de `verify-scope.js` (primera tanda): 49/49 + 1 omitido |
| Limpieza | Citas `QA-*`, bloques, historias, recetas y archivos de prueba borrados (0 citas `QA-*` en la base); 13 archivos físicos huérfanos de las corridas borrados del volumen (la primera limpieza había fallado por la conversión de rutas de Git Bash); médico QA restaurado; caches limpiadas |

## Lo que quedó fuera

Todo lo de la primera tanda se cerró en la segunda. Sigue fuera:

- **MJ-19 (resto)**: `slotDurationMinutes`/`maxPatientsPerSlot` sin efecto, solapes entre bloques y transacción del reemplazo.
- **MJ-25 (resto)**: transacción paciente + cita en el alta.

## Pendiente para otros

- Volver a correr `seed-demo.js --today` en un día sin agenda para ejercitar sus escrituras con las reglas nuevas.
- Documentos actualizados: guía `docs/info/2026-10-04-alcance-por-medico-integracion-frontend.md`, tabla de endpoints de `docs/info/2026-09-25-backend-arquitectura.md`; en `app-gestion-medica`: plan de mejoras y HU-03.1, 03.2, 05.3, 06.1, 06.3, 08.1, 09.1.
