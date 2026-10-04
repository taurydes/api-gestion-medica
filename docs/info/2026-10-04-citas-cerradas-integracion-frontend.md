# Citas cerradas (completadas o canceladas) — integración frontend

- **Base URL:** `http://localhost:8008` (contenedor `medos-backend`)
- **Auth:** `Authorization: Bearer <access_token>` de `POST /auth/login`
- **Envelope de error:** `{ "data": null, "error": "<mensaje>", "statusCode": <código> }`

Una cita en estado `completed` o `cancelled` es final: no se edita, no se reprograma y no se
finaliza. El frontend debe ocultar los botones de editar, reprogramar y finalizar consulta para
esos estados.

**Contrato de estados (desde `b37a92b`):** el estado de una cita solo cambia por endpoints dedicados.
`PATCH /medical-appointments/:id` ya no acepta `status` ni `cancellationReason`.

## Qué cambió en esta versión

| Endpoint | Antes | Ahora | Acción del front |
| --- | --- | --- | --- |
| `PATCH /medical-appointments/:id` sobre `completed`/`cancelled` | 400 (ya existía) | 400, sin cambios | Ocultar "Editar" y "Reprogramar" si `status` es `completed` o `cancelled` |
| `PATCH /medical-appointments/:id/finish-consultation` sobre `cancelled` | 200: creaba el historial y pasaba la cita a `completed` | **400**, no escribe nada | Mostrar "Finalizar consulta" solo en `confirmed` / `in_consultation` (el detalle ya lo hace) |
| `PATCH /medical-appointments/:id` con `status` | Cambiaba el estado | **400** | Usar el endpoint dedicado de cada transición |
| `PATCH /medical-appointments/:id` con `cancellationReason` | Se guardaba | **400** | Cancelar con `/cancel` |
| `PATCH /medical-appointments/:id/confirm` | No existía | **Nuevo**: `pending` → `confirmed` (sin cuerpo) | "Confirmar llegada" |
| `PATCH /medical-appointments/:id/start-consultation` | No existía | **Nuevo**: `confirmed` → `in_consultation` (sin cuerpo) | "Iniciar consulta" |
| `PATCH /medical-appointments/:id/cancel` | Motivo opcional | `{ "cancellationReason": "..." }` **obligatorio** (se recorta; en blanco → 400) | Pedir el motivo antes de cancelar |
| `POST /medical-appointments` con `status` | Aceptaba cualquier estado | Solo `pending` o `confirmed` (por defecto `pending`) | No enviar `status`, o solo esos dos |

Mapa de transiciones:

| Desde | Hacia | Endpoint | Permiso |
| --- | --- | --- | --- |
| `pending` | `confirmed` | `PATCH /:id/confirm` | `appointments.actualizar` |
| `confirmed` | `in_consultation` | `PATCH /:id/start-consultation` | `appointments.actualizar` |
| `pending`, `confirmed`, `in_consultation` | `cancelled` | `PATCH /:id/cancel` | `appointments.actualizar` |
| `confirmed`, `in_consultation` (`pending` → 400 desde `be94683`) | `completed` | `PATCH /:id/finish-consultation` | `medical-history.crear` (antes `appointments.crear`; cambiado en `84d7605`, MJ-50) |

## Errores

| Caso | HTTP | `error` |
| --- | --- | --- |
| Editar o reprogramar una cita completada | 400 | `No se puede modificar una cita ya completada.` |
| Editar o reprogramar una cita cancelada | 400 | `No se puede modificar una cita cancelada.` |
| Finalizar una cita ya completada | 400 | `La cita ya está completada.` |
| Finalizar una cita cancelada | 400 | `No se puede finalizar una cita cancelada.` |
| Cancelar una cita completada | 400 | `No se puede cancelar una cita ya completada.` |
| Finalizar una cita `pending` | 400 | `Solo se puede finalizar la consulta de una cita confirmada o en consulta.` |
| `PATCH /:id/complete` (cualquier cita) | 404 | `Cannot PATCH /medical-appointments/<id>/complete` (endpoint retirado en `be94683`) |
| `PATCH /:id` con `status` | 400 | `["El estado de la cita no se cambia por este endpoint. Use /confirm, /start-consultation, /cancel o /finish-consultation."]` |
| `PATCH /:id` con `cancellationReason` | 400 | `["Para cancelar la cita use PATCH /medical-appointments/:id/cancel."]` |
| Confirmar una cita que no está `pending` | 400 | `Solo se puede confirmar una cita programada.` |
| Iniciar la consulta de una cita que no está `confirmed` | 400 | `Solo se puede iniciar la consulta de una cita confirmada.` |
| Cancelar sin motivo o con motivo en blanco | 400 | `["El motivo de cancelación es requerido.", ...]` |
| `POST` con `status` distinto de `pending`/`confirmed` | 400 | `["Una cita nueva solo puede crearse como pendiente (pending) o confirmada (confirmed)."]` |

Los errores de validación del DTO llegan con `error` como **arreglo**; los de regla de negocio, como texto.

Ejemplo real (`PATCH /medical-appointments/<id-completada>` con `{ "reason": "x" }`):

```json
{ "data": null, "error": "No se puede modificar una cita ya completada.", "statusCode": 400 }
```

Ejemplo real (`PATCH /medical-appointments/<id-pendiente>` con `{ "status": "completed" }`, 2026-10-04 contra `medos-backend`):

```json
{"data":null,"error":["El estado de la cita no se cambia por este endpoint. Use /confirm, /start-consultation, /cancel o /finish-consultation."],"statusCode":400}
```

## Qué NO cambió

- El código sigue siendo **400** (convención del módulo para reglas de negocio), no 409.
- `PATCH /medical-appointments/:id` sigue sirviendo para reprogramar y editar datos (fecha, médico,
  centro, duración, tipo, motivo, observaciones); "Guardar progreso" de la consulta envía solo
  `observations`.
- `/finish-consultation` conserva su contrato de cuerpo (`medicalHistory`, `recipe`), pero desde
  `be94683` solo acepta `confirmed` o `in_consultation`, y desde `84d7605` exige `medical-history.crear`
  y crea la historia `completed`. `/complete`, que completaba sin historia, **se retiró** en `be94683`
  (responde 404); ni la interfaz ni `scripts/seed-demo.js` lo usaban.
- Las citas ya existentes no se tocan: el cambio es solo de contrato.

## Checklist de migración

- [ ] En el listado y el detalle, ocultar "Editar"/"Reprogramar" cuando `status ∈ {completed, cancelled}`.
- [ ] Si la ruta de edición se abre igual (URL directa), mostrar el `error` del 400 y volver al detalle.
- [ ] No ofrecer "Finalizar consulta" sobre citas canceladas.
- [ ] Reemplazar todo `PATCH /:id { status }` por `/confirm`, `/start-consultation` o `/cancel`.
- [ ] Pedir el motivo antes de llamar a `/cancel`.
- [ ] Quitar `status` del alta (o enviar solo `pending`/`confirmed`).

Estado en `app-gestion-medica`: hecho en `132132e` y `e8dcabf`.
