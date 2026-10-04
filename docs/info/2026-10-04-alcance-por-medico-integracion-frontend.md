# Alcance por médico en las escrituras — integración frontend

- **Base URL:** `http://localhost:8008` (contenedor `medos-backend`)
- **Auth:** `Authorization: Bearer <access_token>` de `POST /auth/login`
- **Envelope de error:** `{ "data": null, "error": "<mensaje>", "statusCode": <código> }`

Hasta ahora la **lectura** de citas, historias y perfiles de médico estaba acotada al médico, pero
la **escritura** no: un médico podía, conociendo un id, cancelar la cita de otro, reescribir su
horario o darlo de baja. Desde esta versión toda escritura sigue la misma regla que la lectura:

- **Administrador** (rol con `security.consultar`, p. ej. `superusuario`): sin restricción.
- **Médico no administrador**: solo sobre **sus** datos (sus citas, sus historias, su horario, su perfil) → si no, **403**.
- **Personal sin perfil de médico**: no se acota por médico (hoy ningún rol no médico tiene permisos de escritura sobre citas, historias ni horarios).

Commits de `api-gestion-medica`: `a2652b2` (médicos y horarios), `be94683` (citas), `8caec14`
(historias), `b71d517` (archivos y análisis).

## Qué cambió en esta versión

| Endpoint | Antes | Ahora | Acción del front |
| --- | --- | --- | --- |
| `DELETE /doctors/:id` | Cualquier usuario con `doctors.eliminar` (incluido `medico`) | **Solo administradores** → 403 para el resto, incluido el propio médico. El rol `medico` ya no tiene `doctors.eliminar` | Mostrar "Eliminar Doctor" solo a administradores (hecho: `app` `cafa23e`) |
| `PATCH /doctors/:id` con `isActive` distinto del actual | El médico podía desactivarse | **Solo administradores** → 403 | El formulario puede seguir reenviando el valor actual de `isActive` (no da error) |
| `POST /doctors/schedules` con `doctorId` de otro médico | 200 | **403** | Ninguna: la pantalla de horario de otro médico ya no se abre para un médico (su `GET /doctors/:id` da 403) |
| `PATCH /doctors/schedules/:blockId` (bloque de otro médico) | 200 | **403** | Ídem |
| `DELETE /doctors/schedules/:blockId` | Permiso `doctors.eliminar` | Permiso **`doctors.actualizar`**; bloque de otro médico → 403 | Si alguna pantalla oculta "borrar bloque" por `doctors.eliminar`, cambiarlo a `doctors.actualizar` (la actual no lo condiciona) |
| `PATCH /medical-appointments/:id`, `/confirm`, `/start-consultation`, `/cancel`, `/finish-consultation`, `DELETE` sobre la cita de otro médico | 200 | **403** | Ninguna: un médico solo ve sus citas; mostrar el `error` si llega un 403 |
| `PATCH /medical-appointments/:id` con `doctorId` de otro médico (hecho por un médico) | Reasignaba la cita | **403** | No ofrecer cambiar de médico a un médico no administrador |
| `PATCH /medical-appointments/:id/finish-consultation` sobre `pending` | 200: cerraba sin confirmar llegada | **400** | Ofrecer "Finalizar consulta" solo en `confirmed`/`in_consultation` (el detalle ya lo hace) |
| `PATCH /medical-appointments/:id/complete` | Completaba sin historia | **Retirado → 404** | No usarlo (la interfaz no lo usaba) |
| `POST`, `PATCH`, `DELETE /medical-history` sobre historias de otro médico | 200 | **403** | Ninguna (la interfaz solo lista historias) |
| `PATCH /medical-history/:id` con `patientId`, `doctorId` o `medicalAppointmentId` | Movía la historia | **400** | No enviar esos campos |
| `POST /medical-history` con `medicalAppointmentId` | Aceptaba otro paciente o médico | Paciente y médico deben ser los de la cita → **400** | — |
| `POST /files/appointment-upload` | Guardaba `patientId` y `medicalCenterId` del cuerpo | Paciente, centro e historia **se toman de la cita**. Si el cuerpo los envía distintos → **400**. Solo el médico de la cita o un administrador → si no, **403**. Cita inexistente → 404 | Puede seguir enviando `patientId`, `medicalCenterId` y `medicalHistoryId` de la cita (se aceptan), o dejar de enviarlos |
| `POST /mammography-analyses` | Tomaba el paciente del archivo | Toma el paciente **de la cita**; un archivo cuyo paciente no coincide → **409** | Mostrar el `error` |

## Errores (payloads reales, 2026-10-04 contra `medos-backend`)

| Caso | HTTP | `error` |
| --- | --- | --- |
| `medico` hace `DELETE /doctors/:id` | 403 | `No tienes permisos. Se requiere uno de: doctors.eliminar` (lo corta el guard: el rol ya no tiene el permiso) |
| Rol con `doctors.eliminar` sin ser administrador | 403 | `Solo un administrador puede dar de baja a un médico.` |
| Médico cambia `isActive` (propio u otro) | 403 | `Solo un administrador puede activar o desactivar un médico.` |
| Médico edita el perfil de otro médico (ya existía) | 403 | `No tiene acceso a este perfil de doctor.` |
| Médico toca el horario de otro | 403 | `Solo puede gestionar su propio horario.` |
| Médico escribe sobre la cita de otro (o la reasigna) | 403 | `Solo el médico asignado puede modificar esta cita.` |
| `medico` hace `DELETE /medical-appointments/:id` | 403 | `No tienes permisos. Se requiere uno de: appointments.eliminar` (sin cambios: el rol no tiene el permiso) |
| Finalizar una cita `pending` | 400 | `Solo se puede finalizar la consulta de una cita confirmada o en consulta.` |
| `PATCH /medical-appointments/:id/complete` | 404 | `Cannot PATCH /medical-appointments/<id>/complete` |
| Médico escribe la historia de otro (`POST`/`PATCH`) | 403 | `Solo el médico asignado puede modificar este historial médico.` |
| Médico borra la historia de otro (con permiso de borrado) | 403 | `No tiene acceso a este historial médico.` |
| `PATCH /medical-history/:id` con `patientId` / `doctorId` / `medicalAppointmentId` | 400 | `["<campo> no se puede cambiar: la historia queda ligada a su paciente, médico y cita."]` |
| `POST /medical-history` con cita de otro paciente o médico | 400 | `patientId y doctorId deben ser los de la cita indicada.` |
| Subida con `patientId` distinto al de la cita | 400 | `patientId no corresponde al paciente de la cita.` |
| Subida con `medicalCenterId` / `medicalHistoryId` distinto | 400 | `medicalCenterId no corresponde al centro de la cita.` / `medicalHistoryId no corresponde al historial de la cita.` |
| Subida a la cita de otro médico | 403 | `Solo el médico asignado puede adjuntar archivos a esta cita.` |
| Subida a una cita inexistente | 404 | `La cita indicada no existe.` |
| Análisis de un archivo con paciente distinto al de su cita | 409 | `El archivo no corresponde al paciente de la cita; no se puede analizar.` |

Los errores de validación del DTO llegan con `error` como **arreglo**; los de regla de negocio, como texto.

Ejemplos reales:

```json
{"data":null,"error":"Solo el médico asignado puede modificar esta cita.","statusCode":403}
```

```json
{"data":null,"error":"patientId no corresponde al paciente de la cita.","statusCode":400}
```

```json
{"data":null,"error":["patientId no se puede cambiar: la historia queda ligada a su paciente, médico y cita."],"statusCode":400}
```

## Qué NO cambió

- Las **lecturas** siguen igual (ya estaban acotadas): un médico ve solo sus citas, historias y perfil.
- `POST /medical-appointments` no se acotó: un médico todavía puede agendar a nombre de otro médico (HU-05.1, brecha abierta).
- Recetas (`/recipes`) no se tocaron: sus escrituras siguen sin acotar (MJ-28, abierta).
- Listar y descargar archivos de cita (`GET /files/appointment-files…`) no se acotó (queda en MJ-32).
- La respuesta de `POST /files/appointment-upload` no cambia de forma: es el mismo registro de `appointment_files`; `patientId` y `medicalHistoryId` ahora son los de la cita aunque el cuerpo no los traiga.
- Los datos existentes no se modificaron: en la base había 0 archivos y 0 análisis con paciente distinto al de su cita. Quedan 7 citas `completed` sin historia, anteriores a este cambio.
- `scripts/seed-demo.js` sigue funcionando: el administrador crea y cancela; cada médico cierra y sube a sus propias citas `confirmed`.

## Checklist de migración

- [x] Ocultar "Eliminar Doctor" a quien no sea administrador (`app` `cafa23e`).
- [x] No usar `PATCH /medical-appointments/:id/complete` (la interfaz no lo usaba).
- [ ] Si se agrega una pantalla de edición de historias: no enviar `patientId`, `doctorId` ni `medicalAppointmentId`.
- [ ] Si se agrega borrado de bloques condicionado por permiso: usar `doctors.actualizar`.
- [ ] Mostrar el `error` de los 403 nuevos donde hoy solo se registra en consola (p. ej. `doctor-list` → `onDelete`).
