# PDF de recetas, correo y login sin distinción de mayúsculas: integración frontend

- **Base URL:** `http://localhost:8008` (contenedor `medos-backend`)
- **Auth:** `Authorization: Bearer <access_token>` de `POST /auth/login`
- **Envelope OK:** `{ "code": <status>, "data": … }`. **Excepción:** `GET /documents/jobs/:jobId/file` devuelve el PDF crudo (`application/pdf`), sin envelope.
- **Envelope de error:** `{ "data": null, "error": "<mensaje>" | ["<mensaje>", …], "statusCode": <código> }`

Commits de `api-gestion-medica` (rama `dt/modules`): `365c448` (migración de normalización), `e67248e` (login y
escrituras normalizadas), `cdd2931` (PDF con pdfmake), `774ef30` (cola `documents` y endpoints), `86b5eac` (cola
`email`), `2377893` (endpoints de correo y `notifyPatient`), `633c6f7` (bitácora solo de descargas), `123b916`
(paginación de `GET /recipes`), `c210333` (caché del PDF por contenido), `c8ff1f7` (`notification` en
`finish-consultation`).

## Qué cambió en esta versión

> Actualización 2026-10-05 (2), commits `c210333` y `c8ff1f7`: `finish-consultation` con `notifyPatient: true` ahora
> **devuelve `notification`** (fila marcada **(2)** y sección "`notifyPatient`"); el PDF en caché se regenera cuando
> cambia cualquier dato impreso (antes solo con `updatedAt` de la receta), sin cambio de contrato.

| Endpoint | Antes | Ahora | Acción del front |
| --- | --- | --- | --- |
| `POST /auth/login` (`users` y `seguridad.users`) | `credential` exacto: `" cmendoza"` o `"CMendoza"` → 401 | Se recorta y se compara sin mayúsculas: `" CMENDOZA "` y `"CMendoza@medos-demo.example.com"` entran. El bloqueo por intentos cuenta ambas formas como la misma credencial | Ninguna (opcional: dejar de forzar minúsculas en el input) |
| `POST /users`, `PATCH /users/:id`, `POST /users-security`, `PATCH /users-security/:id`, `PATCH /auth/me` | `name`/`email` se guardaban tal cual | Se guardan **recortados y en minúsculas** (`" Juan@X.com "` → `juan@x.com`). La respuesta trae el valor normalizado | Mostrar lo que devuelve la API, no lo tecleado |
| Mismos endpoints con un nombre o correo que ya existe en otra forma (`Juan` vs `juan`) | `POST /users`: **400** `El correo electrónico o nombre ya está en uso.` · `POST /users-security`: **400** `El correo electrónico ya está en uso.` | **409** `El correo electrónico o nombre de usuario ya está en uso.` (también en `PATCH` si se renombra a uno ajeno) | Tratar **409** como "ya existe"; el 400 queda solo para validación |
| `GET /recipes` (paginado) | `total` y filas contaban ítems de receta: `limit=10` → 9 recetas y `total: 9` con 34 reales | `total` real y `limit` recetas por página; `items` siguen ordenados por `orderNumber` | Ninguna (el paginador ya usa `total`) |
| `GET /recipes/patient/:patientId` | Sin `patient` (el PDF del cliente imprimía `undefined undefined`) | Incluye `patient.commonPerson` | Ninguna; mejor aún, usar el PDF del backend |
| `POST /recipes/:id/pdf` | No existía | **202** `{ jobId, status: "queued" }` | Reemplazar `PdfService` (html2canvas) por este flujo |
| `GET /documents/jobs/:jobId` | No existía | Estado de un trabajo de PDF **o** de correo | Sondear cada 1 s |
| `GET /documents/jobs/:jobId/file` | No existía | El PDF (`application/pdf`) cuando `status = done` | Descargar con `HttpClient` (`responseType: 'blob'`) |
| `POST /recipes/:id/email` | No existía | **202** `{ jobId }` | Botón "Enviar por correo" en la receta |
| `POST /medical-appointments/:id/email-summary` | No existía | **202** `{ jobId }` (solo citas `completed`) | Botón en el detalle de cita completada |
| **(2)** `PATCH /medical-appointments/:id/finish-consultation` | Sin aviso al paciente | Acepta **`notifyPatient?: boolean`**; con `true` encola el resumen **después** de guardar y la respuesta suma **`notification`**: `{ "jobId": "…" }` o `{ "error": "…" }`. Sin `notifyPatient` (o `false`) la respuesta no trae `notification` | Casilla "Enviar resumen al paciente"; con `jobId`, sondear `GET /documents/jobs/:jobId`; con `error`, mostrarlo como aviso (la consulta **sí** quedó cerrada) |

**Lo que NO cambió:** la forma de `POST /auth/login` (sigue sin envelope: `{ access_token, refresh_token }`), los
mensajes de 401/429 del login, el resto de la respuesta de `finish-consultation` (la cita completa; solo se suma `notification`) y el
resto de endpoints de recetas. `GET /recipes/:id` ya traía `patient.commonPerson` y `doctor.commonPerson`.

**Datos:** los 109 usuarios de `public.users` y el de `seguridad.users` ya están normalizados (2 correos tenían
mayúsculas: `jeanCarlos@example.com` → `jeancarlos@example.com`; uno era de un usuario borrado). No hubo colisiones.

## PDF de una receta

Permiso `recipe.consultar` y el mismo alcance que `GET /recipes/:id`: un médico solo pide PDFs de sus recetas
(otro médico → 403), el administrador y el personal no médico pueden pedir cualquiera.

```http
POST /recipes/1def6e45-1603-44d8-9ed5-bb04566608ce/pdf
```

```json
{ "code": 202, "data": { "jobId": "ab38311d-cf80-43d7-98e2-7f413877c890", "status": "queued" } }
```

```http
GET /documents/jobs/ab38311d-cf80-43d7-98e2-7f413877c890
```

```json
{ "code": 200, "data": { "jobId": "ab38311d-cf80-43d7-98e2-7f413877c890", "status": "done" } }
```

Con `status: "failed"` llega también `error`:

```json
{ "code": 200, "data": { "jobId": "…", "status": "failed", "error": "Receta con ID … no encontrada." } }
```

```http
GET /documents/jobs/ab38311d-cf80-43d7-98e2-7f413877c890/file
→ 200, Content-Type: application/pdf, Content-Disposition: attachment; filename="receta-<recipeId>.pdf"
```

| `status` | Significado |
| --- | --- |
| `queued` | En cola, o esperando el reintento tras un fallo (hasta 3 intentos con espera creciente) |
| `processing` | El worker lo está generando |
| `done` | Listo; el archivo se puede descargar |
| `failed` | Falló definitivamente; leer `error` |

Diseño del PDF: el mismo del cliente (encabezado con centro y dirección, número de receta, recuadro del paciente con
nombre completo y documento, recuadro del médico con nombre y especialidad, diagnóstico, tabla
medicamento/dosis/frecuencia/duración/cantidad con presentación e indicaciones, instrucciones, notas, línea de firma
con el nombre del médico, fecha de impresión e "ID Gestión"). Un nombre faltante sale como `Sin nombre registrado`,
nunca `undefined`.

Flujo sugerido: `POST …/pdf` → sondear `GET /documents/jobs/:jobId` cada 1 s hasta `done`/`failed` → descargar el
archivo como blob y abrirlo con `URL.createObjectURL`. El archivo pide el `Bearer`, así que un `<a href>` directo no
sirve. 20 pedidos simultáneos terminan en ~1,2–1,8 s (ver la tarea).

## Correo

Desactivado por defecto (`MAIL_ENABLED=false`): ambos endpoints responden **503**. En el `docker-compose` de
desarrollo está activado contra **Mailpit**: todo correo queda capturado en `http://127.0.0.1:8025` y no sale a
Internet.

Alcance: solo **el médico de la consulta o un administrador** (el personal no médico recibe 403, aunque pueda leer la
receta). Permisos: `recipe.consultar` y `appointments.consultar` respectivamente.

```http
POST /recipes/1def6e45-1603-44d8-9ed5-bb04566608ce/email
Content-Type: application/json

{}
```

```json
{ "code": 202, "data": { "jobId": "c13e1c4c-bdf2-4ab7-98e0-fef89147d535" } }
```

`to` es opcional; sin él va al correo del paciente (`patients.email`):

```json
{ "to": "otro@example.com" }
```

```http
POST /medical-appointments/a4eb91c1-2e86-4fd7-a41f-bde3c54b6187/email-summary
Content-Type: application/json

{}
```

```json
{ "code": 202, "data": { "jobId": "3f6910e5-45b6-4a62-81d2-e07c4d8378a4" } }
```

El estado se consulta en el mismo `GET /documents/jobs/:jobId` (`queued` también cubre "esperando que se genere el
PDF adjunto"). `GET …/file` de un trabajo de correo responde 404.

Contenido:

- **Receta:** asunto `Receta médica REC-2026-00153 - <centro>`; cuerpo con centro, médico, fecha y número; adjunto
  `receta-REC-2026-00153.pdf`.
- **Resumen de cita:** asunto `Resumen de su consulta - <centro>`; centro, médico, fecha, motivo, diagnóstico,
  observaciones y nombres de los exámenes solicitados; la receta de la cita adjunta si la hay.
- Ambos terminan con `Documento confidencial: contiene información médica dirigida solo a su destinatario…`. No
  llevan signos vitales, síntomas, examen físico ni plan de tratamiento, ni otro adjunto que la receta.

### `notifyPatient` en `finish-consultation`

```json
{
  "notifyPatient": true,
  "medicalHistory": { "consultationDate": "2026-10-05T16:44:00.000Z", "reasonForVisit": "Control" },
  "recipe": { "items": [{ "medicationName": "Paracetamol", "dosage": "500mg", "frequency": "cada 8 horas", "quantity": 9 }] }
}
```

El correo se encola después del commit. **Nunca hace fallar la consulta**: la respuesta es siempre la de éxito
(200, cita `completed`) y suma `notification` con el resultado del encolado:

```json
{ "code": 200, "data": { "id": "c3d407dd-…", "status": "completed", "…": "…", "notification": { "jobId": "a147daa7-96a2-4e35-8767-088806fb592a" } } }
```

```json
{ "code": 200, "data": { "id": "a0c6b59e-…", "status": "completed", "…": "…", "notification": { "error": "El paciente no tiene correo registrado." } } }
```

| `notification` | Cuándo |
| --- | --- |
| `{ "jobId": "<uuid>" }` | Encolado; el estado del envío en `GET /documents/jobs/:jobId` |
| `{ "error": "El paciente no tiene correo registrado." }` | Paciente sin `email` |
| `{ "error": "El envío de correos no está configurado." }` | `MAIL_ENABLED=false` |
| `{ "error": "Solo el médico de la consulta o un administrador puede enviar este correo." }` | Quien cierra no es el médico ni administrador |
| `{ "error": "No se pudo encolar el correo al paciente." }` | Fallo inesperado (p. ej. Redis caído); el detalle queda en el log |
| (ausente) | `notifyPatient` omitido o `false` |

## Errores

| Código | Mensaje | Cuándo |
| --- | --- | --- |
| 400 | `El paciente no tiene correo registrado.` | Correo sin `to` y paciente sin `email` |
| 400 | `["El destinatario debe ser un correo electrónico válido."]` | `to` mal formado |
| 400 | `Solo se puede enviar el resumen de una cita completada.` | `email-summary` de una cita que no está `completed` |
| 403 | `No tiene acceso a esta receta.` | `POST /recipes/:id/pdf` de una receta de otro médico |
| 403 | `Solo el médico de la consulta o un administrador puede enviar este correo.` | Correo de otro médico o de personal no médico |
| 403 | `Solo quien solicitó el trabajo o un administrador puede consultarlo.` | Estado o archivo de un trabajo ajeno |
| 404 | `Receta con ID <id> no encontrada.` / `Cita médica con ID <id> no encontrada.` | Recurso inexistente o borrado |
| 404 | `Trabajo no encontrado o ya expirado.` | `jobId` desconocido, o ya purgado (terminados: 1 h; fallidos: 24 h) |
| 404 | `Este trabajo no genera un archivo.` | `…/file` de un trabajo de correo |
| 409 | `El documento aún no está listo.` | `…/file` antes de `done` (o si falló) |
| 409 | `El correo electrónico o nombre de usuario ya está en uso.` | Alta o edición de usuario con nombre/correo existente en cualquier forma |
| 503 | `El envío de correos no está configurado.` | `MAIL_ENABLED=false` |
| `failed` + `error` | `No se pudo generar el documento.` · `No se pudo enviar el correo.` · `No se pudo generar el PDF adjunto.` | Fallo tras los reintentos (el detalle técnico queda en el log del servidor) |

Límite de peticiones: el general de la API (20 por 10 s por IP) también cuenta los sondeos; un sondeo cada 1 s de un
solo trabajo queda holgado.

## Checklist de migración

- [ ] Login: nada obligatorio; si el input forzaba minúsculas, puede quitarse.
- [ ] Formularios de usuario: mostrar **409** como "ya existe"; refrescar con el valor devuelto (minúsculas).
- [ ] Reemplazar `PdfService.generateRecipePdf` (html2canvas + jsPDF) por `POST /recipes/:id/pdf` + sondeo + descarga
      como blob, en lista de recetas, detalle de paciente y detalle de cita.
- [ ] Botón "Enviar por correo" en la receta (`POST /recipes/:id/email`, `to` opcional) y "Enviar resumen" en la cita
      completada (`POST /medical-appointments/:id/email-summary`); mostrar el `error` en 400/403/503.
- [ ] Casilla `notifyPatient` al finalizar la consulta; leer `notification` de la respuesta (`jobId` → sondear,
      `error` → aviso sin revertir nada).
- [ ] Ocultar o deshabilitar los botones de correo si la API responde 503.
