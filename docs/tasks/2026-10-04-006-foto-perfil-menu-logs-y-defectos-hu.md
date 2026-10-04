# 2026-10-04-006 — Foto efectiva en `imageUrl`, menú `logs` y defectos hallados al revisar las HU

## Qué se pidió

Seguimientos de backend anotados por el agente de frontend en
`app-gestion-medica/docs/tasks/2026-10-04-006-bloque-mejoras-frontend.md` ("Pendiente para otros") y los
defectos de backend de la tabla "Inconsistencias encontradas al verificar" de
`app-gestion-medica/docs/tasks/2026-10-04-002-ingenieria-inversa-hu.md`:

1. `GET /auth/profile.imageUrl` se derivaba solo de `common_person_images`; la foto de `POST /files/profile-photo`
   (`commonPerson.photoUrl`) no aparecía. Unificar en `/auth/profile`, `GET /users/:id` y `GET /users`.
2. Menú `logs`: `url = /audit/access-log`, nombre "Bitácora de accesos" (la pantalla del front existe: `app` `22e13d6`).
3. Documento de mejoras del front: fila MJ-39 y línea "Estado" de la cabecera (commits aparte en `app-gestion-medica`).
4. Nota de credenciales de demo en el QA histórico que cita `mario` / `QaSuper123!`.
5. Defectos 1–4, 6–11, 16 y 17 de la tabla de inconsistencias (ver bitácora).

## Bitácora

| Commit | Contenido |
|---|---|
| `a128225` | `imageUrl` = `commonPerson.photoUrl` → última imagen activa → `null`, en perfil propio, detalle y listado de usuarios; specs con el `UserService` real |
| `0113865` | Migración `LogsMenuAccessLog1790520800000`: menú `logs` → "Bitácora de accesos", `/audit/access-log`, visible; `down` restaura `Logs` / `#` / oculto |
| `9003bc2` | Defectos 1 y 2: fotos de persona con `file.crear` **o** `patient.crear`/`patient.actualizar` (lectura con `file.consultar` o `patient.consultar`); foto de perfil ajena solo para administrador (`assertAdmin`), se retira `UserAccessService` de `PhotoAccessService` |
| `ecfac67` | Defectos 3, 4, 7, 8, 9, 11, 17: `createdBy`/`updatedBy` de departamentos; `removeDoctor` con `deletedAt IS NULL`; mensaje de `patientId`; `reason` recortado; `PATCH /recipes` rechaza ids fijos con 400 (`@IsEmpty`); comentario del panel; `limit` del Swagger |
| `96cb806` | Defecto 10: `/health` en 503 dice `Servicio no disponible: <indicadores>` y el filtro reenvía `details` |
| `5f4acb2` | Defecto 16: logins fallidos (`/auth/login`, `/admin/login`) en `access_log` como `login_failed`; migración `AccessLogLoginFailed1790520900000` (`action` a 20 caracteres) |
| `app` `934d26d`, `60e15d0` | Fila MJ-39 y línea "Estado" de `docs/plans/2026-10-04-mejoras-detectadas-hu.md` (una línea cada uno) |
| (este) | Guía de integración, nota de credenciales en el QA de fases 0-1 y este documento |

## Decisiones

- **Prioridad de la foto**: `commonPerson.photoUrl` gana sobre `common_person_images` porque es lo que escribe el
  flujo vigente (`POST /files/profile-photo` + `PATCH /auth/me`); la tabla de imágenes es el camino anterior y queda
  como respaldo. Misma regla que ya usaba `appointment-response.dto.ts` para pacientes y médicos, pero invertida: ahí
  la tabla gana porque esos registros nunca pasan por `profile-photo`. No se tocó para no cambiar un contrato que el
  front ya consume.
- **`/auth/me`** no expone foto; no se tocó.
- **Fotos de persona (defecto 1)**: se eligió ampliar los permisos de las rutas (`file.crear` o `patient.crear`/`patient.actualizar`)
  en vez de dar `file.crear` al `enfermero` por migración: `file.crear` abre también `upload-base64`, `video`,
  `appointment-upload` y `dicom-convert`, que la enfermera no necesita. La guarda de dueño de MJ-43 (`assertCanSetPersonPhoto`)
  sigue decidiendo *de quién* puede ser la foto; el permiso solo decide *quién entra*. Los `GET` correspondientes aceptan
  `patient.consultar` para que la misma enfermera vea la foto que subió.
- **Foto de perfil ajena (defecto 2)**: `security.consultar` (mismo criterio de "administrador" del resto del sistema), como
  decía la guía. Un médico con `file.consultar` ya no la ve.
- **`PATCH /recipes` (defecto 9)**: `@IsEmpty` por campo en el DTO en lugar de `forbidNonWhitelisted` global, que cambiaría
  el contrato de todos los endpoints (hoy los campos desconocidos se descartan en silencio en toda la API).
- **Centro inexistente al agendar (defecto 6)**: se mantiene el **404**; se corrigió la guía, que lo ponía bajo el 400.
- **Logins fallidos (defecto 16)**: solo se registran los fallos (401 y 429; un 400 de validación también entra con su código).
  El login correcto no se registra (no es un cambio de datos y `req.user` no existe en ese punto); `refresh` y `logout`
  siguen fuera por ruido. La credencial escrita va en `resourceId` (64 caracteres, nunca la contraseña). `action` pasa a
  `varchar(20)`; el `down` borra las filas `login_failed` antes de estrechar la columna.
- **`/health` (defecto 10)**: se resuelve en el controlador (terminus lanza su resultado sin `message`) y el filtro global
  reenvía `details` solo cuando la excepción lo trae; ningún otro endpoint lo produce.
- **Defecto 5** (citas sin alcance por centro para personal no médico) no se tocó: ningún rol no médico tiene
  `appointments.consultar`; sigue anotado en la HU.

## Verificación

| Qué | Resultado |
|---|---|
| `npx tsc -p tsconfig.build.json --noEmit` antes de cada commit | 0 errores |
| `npx jest --ci` | **592/592** (baseline 574; +18). Specs nuevas con el servicio o controlador real: `profile.service` (prioridad de la foto en `getOwnProfile` y `findOne`), `photo-access` (perfil ajeno solo admin; permisos de las 4 rutas), `departments-audit-fields` (controlador + servicio), `medical-center-remove-doctor`, `update-recipe.dto`, `mammography-analysis.rules` (motivo recortado), `health.controller`, `http-exception-filter` (503 con `details`), `access-log.interceptor` (login fallido API y panel; login correcto no) |
| Migraciones (2 nuevas) | `LogsMenuAccessLog1790520800000` y `AccessLogLoginFailed1790520900000`: `run` → `revert` → `run`; `migration:generate --dryrun --check` → "No changes in database schema were found" tras cada una |
| Contenedor | `medos-backend` reconstruido con `1b8a2d2` (+ el comentario de `b2e01a7`): "No migrations are pending" (ya aplicadas desde el host), `/health` 200 |
| Base | `seguridad.menu` slug `logs` → `Bitácora de accesos`, `/audit/access-log`, `es_visible = true`; `auditoria.access_log.action` → `varchar(20)` |
| API (`verify-followups.mjs` en el scratchpad) | **17/17**: `cmendoza` `/auth/profile.imageUrl` = `commonPerson.photoUrl`; foto de perfil de `cmendoza` → `rparedes` 403, `enf.ramirez` 403, propia 200, `admin.caracas` 200; `enf.ramirez` crea paciente (201) y le sube foto (201), la ve (200) y `rparedes` también (200); la enfermera sobre la persona de un médico → 403; `PATCH /recipes/:id` con `medicalAppointmentId` → 400 con el campo; `admin.caracas` crea y edita un departamento → `created_by`/`updated_by` = su id; contraseña errónea → 401 y `POST /admin/login` → 401, ambos en `GET /audit/access-log?action=login_failed` con `userId` null y la credencial |
| `/health` con `medos-ml-api` detenido | **503** `{"error":"Servicio no disponible: detector","statusCode":503,"details":{…,"detector":{"status":"down","message":"fetch failed"}}}`; al arrancarlo de nuevo, 200 |

Limpieza: paciente, persona y departamento de la verificación borrados (filas y la carpeta `uploads/common-persons/<personId>`);
6 filas de `access_log` de la corrida borradas (los `login_failed` incluidos); el contador de fallos de `cmendoza` se limpió con un login correcto.

## Lo que quedó fuera

- **Defecto 5** (`GET /medical-appointments` sin alcance por centro para personal no médico): sin efecto hoy; no se tocó.
- **Defectos 12–15** son de frontend (horario sin `maxDailyAppointments`, `birthDate`/`sex` en médicos y usuarios, botones de la cita, etiqueta de la bandeja).
- **Defecto 19** (lecturas de horario y disponibilidad sin usuario): anotado en las HU; no se cambió.
- `/auth/me` no expone foto; no se agregó.
- Un login correcto no se registra en la bitácora (decisión, ver arriba).

## Pendiente para otros

- Front: el sidebar puede mostrar la bitácora con el nombre del menú (`Bitácora de accesos`) ahora que es visible; hoy ya la resuelve por `slug`.
- Front (opcional): en la pantalla de bitácora, filtro `action=login_failed` y mostrar `resourceId` como "usuario intentado".
