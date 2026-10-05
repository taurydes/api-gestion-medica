# 2026-10-05-003 — Login sin mayúsculas, PDF de recetas en el backend y cola de correo

## Qué se pidió

1. Usuario y correo recortados y sin distinción de mayúsculas en login (`users` y `seguridad.users`), refresh,
   clave de bloqueo, alta/edición de usuarios, perfil y búsquedas; guardarlos normalizados; migración con
   resolución de colisiones e índices únicos sobre la forma normalizada.
2. PDF de receta generado en el backend con `pdfmake`, cola BullMQ `documents` con worker acotado por
   `PDF_CONCURRENCY`, caché por `updatedAt`, contrato `POST /recipes/:id/pdf` + `GET /documents/jobs/:jobId[/file]`.
3. Cola `email` (nodemailer) con `POST /recipes/:id/email`, `POST /medical-appointments/:id/email-summary` y
   `notifyPatient` en `finish-consultation`; Mailpit para desarrollo.
4. Tests de procesadores con cola falsa, del builder (nombres sin `undefined`), de destinatarios/adjuntos y de 403.

Contrato fijado por el agente de frontend: implementado tal cual (ver guía
`docs/info/2026-10-05-pdf-correo-integracion-frontend.md`).

## Bitácora

| Commit | Contenido |
|---|---|
| `365c448` | Migración `NormalizeUserIdentities1790521000000`: colisiones → sufijo `-dupN` (correo: `+dupN@`), `lower(btrim())` de `name`/`email` en ambas tablas, índices únicos de expresión (`public`: parciales `deleted_at IS NULL`; `seguridad`: totales, como antes). Entidades con `@Index(..., { synchronize: false })` |
| `e67248e` | `normalizeIdentity` + decorador `@NormalizeIdentity()` en los DTO; login, clave de bloqueo, alta/edición de `users` y `users-security`, perfil. Duplicado → 409 |
| `cdd2931` | Builder del PDF con `pdfmake` (fuentes estándar, sin acceso a URL ni a disco) |
| `774ef30` | Cola `documents`, `RecipePdfService` (caché), worker, `DocumentsService`/`Controller`, `POST /recipes/:id/pdf`; `findByPatient` carga `patient.commonPerson` |
| `86b5eac` | Módulo de correo: `MailTransport`, `EmailService` (flujo con hijos PDF), `EmailProcessor`, contenido, `email_sent` en `access_log`, variables Joi |
| `2377893` | Endpoints de correo y `notifyPatient` |
| `633c6f7` | La bitácora registra la descarga del PDF y no cada sondeo de estado |
| `123b916` | Defecto hallado al verificar: `GET /recipes` paginaba y contaba filas de ítems (ver abajo) |

`86b5eac` pasa de las 400 líneas: incluye el formateo con Prettier de los archivos nuevos de `src/documents`
(solo forma) y los specs del módulo; separarlo dejaba commits sin tests.

## Decisiones

| Decisión | Motivo |
|---|---|
| Normalizar en el DTO **y** en el servicio | El DTO hace que `" Juan@X.com "` pase `@IsEmail`; el servicio cubre llamadas internas y los tests con el servicio real |
| Login por igualdad sobre el valor normalizado (no `lower()` en la consulta) | Los datos quedan normalizados por la migración y por toda escritura; el índice único de expresión impide que convivan variantes. Mantiene `findOne` y los specs existentes |
| Índices de expresión `lower(btrim(...))` además de guardar normalizado | Una inserción por SQL con mayúsculas igual choca (probado: `'CMendoza '` → 23505 `UQ_users_name_normalized_active`; `' ADMIN@yopmail.com'` → 23505 `UQ_seguridad_users_email_normalized`) |
| Duplicado 409 en vez de 400 | Lo pide el contrato ("creating Juan when juan exists → 409") y es el código de conflicto del resto de la API |
| El chequeo de unicidad en `PATCH` solo corre si el nombre/correo cambia | Reenviar el propio nombre en el formulario no debe consultar ni fallar |
| Refresh y reset de contraseña sin cambios | Ambos buscan por `id`, no por credencial |
| Caché del PDF: `mtime` del archivo = `updatedAt` de la receta, comparación por igualdad | Inmune a la diferencia de reloj o zona entre Postgres y Node (`>=` regeneraría siempre o serviría un PDF viejo) |
| Escritura a `.tmp` + `rename` | Dos workers sobre la misma receta nunca dejan un PDF a medio escribir |
| Archivo por receta (`uploads/documents/<recipeId>.pdf`), no por trabajo | Es lo que permite reutilizarlo; el `jobId` apunta a la receta |
| Concurrencia del worker fijada en `onApplicationBootstrap` | `@Processor({ concurrency })` se evalúa antes de que `ConfigModule` cargue el `.env` local |
| El correo es un flujo BullMQ: trabajo `email` con hijos `documents` (`failParentOnFailure`) | El adjunto pasa por la misma cola acotada; el correo no se envía si el PDF falla |
| `failedReason` sin detalle técnico (`No se pudo generar el documento.` / `No se pudo enviar el correo.`) | Llega al cliente por `GET /documents/jobs/:id`; el error SMTP o de BD queda en el log |
| Receta borrada → `UnrecoverableError` | Reintentar no la va a traer de vuelta |
| Alcance del correo: médico de la consulta o admin (más estricto que leer la receta) | Lo pide el contrato; el personal no médico puede leer recetas pero no enviarlas |
| Permiso de los endpoints de correo: `recipe.consultar` / `appointments.consultar` | Son las lecturas del recurso que se envía; el alcance por médico es el control real |
| `notifyPatient` fuera de la transacción y sin propagar errores | Lo pide el contrato; la consulta queda cerrada aunque el correo no pueda encolarse |
| Una fila `email_sent` por correo entregado, sin la dirección | Deja rastro del envío sin guardar datos de contacto en la bitácora |
| Status de trabajos fuera de la bitácora; la descarga sí | El sondeo cada 1 s generaba una fila por segundo |
| `nodemailer` 8.0.11 y no 10.0.15 | La 10.0.15 se publicó el mismo día de esta tarea |

## Verificación

| Qué | Resultado |
|---|---|
| Colisiones antes de normalizar (`GROUP BY lower(btrim())`) en ambas tablas | 0. Valores no normalizados: 2 correos en `public.users` (uno de un usuario borrado), 0 en `seguridad.users` |
| `migration:run` → `revert` → `run` | OK |
| `migration:generate` después | "No changes in database schema were found" |
| `npx tsc -p tsconfig.build.json --noEmit` antes de cada commit | Limpio |
| `npm run build` | 0 errores, 0 advertencias |
| `npx jest --ci` | **684** pruebas, 85 suites (baseline anterior 629) |
| Login `" CMENDOZA "` y `CMendoza@medos-demo.example.com` contra el contenedor | 201 |
| `POST /recipes/<REC-2026-00153>/pdf` → `file` antes de terminar → estado → descarga | 202 → 409 → `done` → 200 `application/pdf`, 3943 bytes, `%PDF-`; texto extraído contiene "Johana … Silva" y "Carolina … Mendoza", sin `undefined` |
| Correo de la receta | 202 → `done`; en Mailpit: asunto `Receta médica REC-2026-00153 - Centro Clínico Ávila`, a `johana.silva28@example.com`, 1 adjunto `receta-REC-2026-00153.pdf` (3943 bytes), pie de confidencialidad; fila `email_sent` en `access_log` |
| `email-summary` de una cita completada | 202 → `done`; Mailpit con motivo, diagnóstico, observaciones y receta adjunta |
| `finish-consultation` con `notifyPatient: true` (cita `a01d4c3c…`, confirmada antes) | 200 `completed`; log `Resumen de la cita … encolado`; correo en Mailpit con exámenes y receta `REC-2026-00180`; el `symptoms` enviado no aparece en el correo |
| Errores en vivo | `to` inválido → 400; cita no completada → 400; PDF/correo de receta de `lgutierrez` → 403; trabajo de `cmendoza` consultado por `lgutierrez` → 403; `jobId` desconocido → 404 |
| 20 `POST /recipes/:id/pdf` simultáneos (20 recetas distintas, sin caché) | 20 × 202 en 1,4–1,8 s; los 20 terminaron `done` en **1,16 s** (contenedor nuevo) y 1,83 s (primera corrida), medido con `timestamp`/`finishedOn` de BullMQ; render 112–160 ms de media, máx. ~345 ms; **nunca más de 2 activos a la vez** |
| Memoria del backend (`docker stats`) | Primera corrida: 94–100 MiB antes → pico **147 MiB**. Contenedor recién levantado: 147 MiB en reposo → ≤ 134 MiB durante la ráfaga. Mailpit: 22 MiB |

## Defecto hallado y corregido: paginación de `GET /recipes`

Durante la verificación, `GET /recipes?limit=25` de `cmendoza` devolvía `total: 23` (y `limit=10` → `total: 9`)
con 34 recetas suyas en la base. Reproducido con el mismo query builder contra la base: el `addOrderBy('items.orderNumber')`
sobre la relación uno-a-muchos hacía que TypeORM aplicara `skip/take` y el conteo a las filas de ítems. Sin ese
orden: `total: 34` para 10, 25 y 50. Corrección (`123b916`): orden solo por columnas de la receta (`issueDate`,
desempate `id`) y los ítems se ordenan en memoria. Verificado en el contenedor: `limit=10` → páginas 1 y 2 de 10
filas, `total: 34`, ítems en orden. Las respuestas ya cacheadas con la clave vieja expiran con el TTL de listas
(o al crear/editar una receta). `patient.service` ordena por `commonPerson` (muchos-a-uno): no multiplica filas.

## Entorno: Mailpit (no versionado)

`tesis/docker-compose.yml` no está en git; se editó a mano (copia previa en el scratchpad de la sesión):

- Servicio `mailpit` (`axllent/mailpit:v1.31.4`, contenedor `medos-mailpit`): SMTP 1025 solo dentro de
  `tesis-network`; UI/API publicada solo en `127.0.0.1:8025`.
- Variables del `backend`: `PDF_CONCURRENCY=2`, `MAIL_ENABLED=true`, `SMTP_HOST=mailpit`, `SMTP_PORT=1025`,
  `SMTP_SECURE=false`, `MAIL_FROM=MedOS <no-reply@medos.local>`.
- Consulta rápida: `curl localhost:8025/api/v1/messages`.

Para producción: `MAIL_ENABLED=true` con `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM`
reales (Joi exige `SMTP_HOST` cuando `MAIL_ENABLED=true`). Sin eso los endpoints responden 503.

## Fuera de alcance / pendiente

- **Frontend:** reemplazar `PdfService` (html2canvas) por el flujo del backend y agregar los botones de correo y la
  casilla `notifyPatient` (checklist en la guía). El agente de frontend ya ejercitó `email-summary` y el correo de
  receta contra este backend (correos `E2E-…` en Mailpit).
- La caché del PDF se invalida por `updatedAt` de la receta: si cambia el nombre del paciente o del médico, o el
  centro, el PDF viejo se reutiliza hasta que la receta se edite. Aceptado: la receta es un documento emitido.
- La respuesta de `finish-consultation` no informa si el correo se encoló (el contrato no lo pide).
- El 503 con `MAIL_ENABLED=false` está cubierto por tests; no se probó en vivo porque el contenedor corre con correo
  activado.
- `npm run lint` sigue en rojo en todo el repo (miles de errores previos de Prettier/ESLint); los archivos nuevos se
  formatearon con Prettier.
