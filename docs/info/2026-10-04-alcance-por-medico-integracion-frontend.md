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
(historias), `b71d517` (archivos y análisis); segunda tanda: `855cb01` (horario solo en centros del
médico), `d3eebf2` (recetas), `cd41550` (listar/descargar archivos), `7466074` y `0709eb7` (alta de
citas a nombre propio), `46512e8` (`medico` sin `doctors.crear`); tercera tanda: `12ae3dd` (cupo por
turno y alta atómica de paciente + cita), `4a10e09` (bloques sin solape y reemplazo atómico).

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
| `POST /doctors/schedules` con un centro que no es del médico | 200 | **400** (también para administradores) | La pantalla ya ofrece solo los centros del médico |
| `POST /doctors` por un `medico` | 200/400 | **403** (el rol ya no tiene `doctors.crear`) | Los botones "Nuevo doctor" ya se ocultan por ese permiso |
| `POST /medical-appointments` con `doctorId` de otro médico (hecho por un médico) | 201 | **403**, antes de crear al paciente | Ninguna: el selector del médico solo lo muestra a él |
| `POST`, `PATCH`, `/dispense`, `/cancel`, `DELETE` en `/recipes` sobre recetas o historias de otro médico | 200 | **403** | Ninguna: un médico solo lista sus recetas |
| `POST /recipes` con paciente, médico o cita distintos a los de la historia | 201 | **400** | — |
| `GET /files/appointment-files?appointmentId=` y `GET /files/appointment-files/:fileId` de citas ajenas | 200 | **403**; cita o archivo inexistente → 404 | Ninguna: solo los usa el detalle de la cita |
| `POST`/`PATCH /medical-appointments` con centro | Rechazaba cualquier solape con otra cita del médico | Cuenta por **turno**: cada turno del bloque (`slotDurationMinutes` desde su inicio) admite `maxPatientsPerSlot` citas; turno lleno → **400**. Un solape en otro centro sigue siendo 400 | Mostrar el `error`; con 1 paciente por turno (todos los médicos demo) el efecto es el mismo que antes |
| `POST /medical-appointments` con persona nueva | Creaba persona y paciente aunque la cita fallara | Valida todo antes y guarda persona, paciente y cita en **una transacción** | Ninguna: un reintento ya no choca con un paciente huérfano |
| `GET /medical-appointments/availability` | Sin turnos | **Nuevo campo `slots`**: `[{ start, end, capacity, booked, available }]`; `available` exige además algún turno libre | Puede ofrecer los turnos libres en vez de la hora en campo libre (hoy la interfaz no lo hace) |
| `GET /medical-appointments/available-dates` | `slotsAvailable = cupo diario − citas` | `mín(cupo diario − citas, lugares libres en los turnos)` | Ninguna (mismo contrato) |
| `POST /doctors/schedules`, `PATCH /doctors/schedules/:blockId` | Aceptaban bloques solapados | Bloques del mismo día que se solapan, **en cualquier centro** → **400**; el reemplazo es atómico | Mostrar el `error`; un bloque inactivo también cuenta |
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
| Horario en un centro no asignado al médico | 400 | `El médico no está asignado a ese centro médico.` |
| Turno lleno al agendar o reprogramar | 400 | `El turno de las 08:00 ya está completo: admite 1 paciente(s) y tiene 1.` |
| Bloque solapado con otro del médico | 400 | `El bloque Domingo 11:00–13:00 se solapa con otro bloque del médico (08:00–12:00).` |
| `medico` hace `POST /doctors` | 403 | `No tienes permisos. Se requiere uno de: doctors.crear` |
| Médico agenda a nombre de otro | 403 | `Un médico solo puede agendar citas a su nombre.` |
| Médico escribe la receta (o la historia de la receta) de otro | 403 | `Solo el médico de la consulta puede modificar esta receta.` |
| Médico borra la receta de otro (con permiso de borrado) | 403 | `No tiene acceso a esta receta.` |
| `POST /recipes` con paciente o médico ajenos a la historia | 400 | `patientId y doctorId deben ser los del historial médico indicado.` |
| `POST /recipes` con cita ajena a la historia | 400 | `medicalAppointmentId no corresponde al historial médico indicado.` |
| Listar o descargar archivos de una cita ajena | 403 | `No tiene acceso a los archivos de esta cita.` |
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
- La respuesta de `POST /files/appointment-upload` no cambia de forma: es el mismo registro de `appointment_files`; `patientId` y `medicalHistoryId` ahora son los de la cita aunque el cuerpo no los traiga.
- En la base había 0 archivos y 0 análisis con paciente distinto al de su cita, y 0 bloques de horario en centros no asignados. Las 7 citas `completed` sin historia (pruebas de feb–mar 2026) pasaron a `cancelled` con motivo `Cerrada sin consulta registrada (dato de prueba anterior a la regla de cierre).` (`docs/info/migrations/2026-10-04-citas-completadas-sin-historia.sql`); el listado las muestra como canceladas.
- La respuesta de `POST /recipes` y de los endpoints de archivos no cambia de forma.
- `availability` solo **agrega** `slots`; `occupiedSlots`, `schedule`, `currentCount` y `available` siguen. Los 14 bloques de prueba de `daniel` y `julio` que tenían 10 pacientes por turno quedaron en 1 (`docs/info/migrations/2026-10-04-horarios-cupo-por-turno.sql`).
- El cupo diario ya **no** se toma del primer bloque del día: desde `a8f71e7` es la **suma** de
  `maxDailyAppointments` de los bloques activos del día en el centro (`dailyCap` en
  `src/doctors/schedule-time.util.ts`); ver la guía del bloque de mejoras.
- `scripts/seed-demo.js` sigue funcionando: el administrador crea y cancela; cada médico cierra y sube a sus propias citas `confirmed`.

## Checklist de migración

- [x] Ocultar "Eliminar Doctor" a quien no sea administrador (`app` `cafa23e`).
- [x] No usar `PATCH /medical-appointments/:id/complete` (la interfaz no lo usaba).
- [ ] Si se agrega una pantalla de edición de historias: no enviar `patientId`, `doctorId` ni `medicalAppointmentId`.
- [ ] Si se agrega borrado de bloques condicionado por permiso: usar `doctors.actualizar`.
- [x] Mostrar el `error` de los 403: lo hace el interceptor global (`error.interceptor.ts`) con el mensaje de la API; `doctor-list` → `onDelete` ya no lo duplica y confirma la baja (`app` `640d089`).
