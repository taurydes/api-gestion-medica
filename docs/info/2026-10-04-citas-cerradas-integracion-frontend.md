# Citas cerradas (completadas o canceladas) — integración frontend

- **Base URL:** `http://localhost:8008` (contenedor `medos-backend`)
- **Auth:** `Authorization: Bearer <access_token>` de `POST /auth/login`
- **Envelope de error:** `{ "data": null, "error": "<mensaje>", "statusCode": <código> }`

Una cita en estado `completed` o `cancelled` es final: no se edita, no se reprograma y no se
finaliza. El frontend debe ocultar los botones de editar, reprogramar y finalizar consulta para
esos estados.

## Qué cambió en esta versión

| Endpoint | Antes | Ahora | Acción del front |
| --- | --- | --- | --- |
| `PATCH /medical-appointments/:id` sobre `completed`/`cancelled` | 400 (ya existía) | 400, sin cambios | Ocultar "Editar" y "Reprogramar" si `status` es `completed` o `cancelled` |
| `PATCH /medical-appointments/:id/finish-consultation` sobre `cancelled` | 200: creaba el historial y pasaba la cita a `completed` | **400**, no escribe nada | Mostrar "Finalizar consulta" solo en `confirmed` / `in_consultation` (el detalle ya lo hace) |

## Errores

| Caso | HTTP | `error` |
| --- | --- | --- |
| Editar o reprogramar una cita completada | 400 | `No se puede modificar una cita ya completada.` |
| Editar o reprogramar una cita cancelada | 400 | `No se puede modificar una cita cancelada.` |
| Finalizar una cita ya completada | 400 | `La cita ya está completada.` |
| Finalizar una cita cancelada | 400 | `No se puede finalizar una cita cancelada.` |
| Cancelar una cita completada | 400 | `No se puede cancelar una cita ya completada.` |
| Completar una cita cancelada | 400 | `No se puede completar una cita cancelada.` |

Ejemplo real (`PATCH /medical-appointments/<id-completada>` con `{ "reason": "x" }`):

```json
{ "data": null, "error": "No se puede modificar una cita ya completada.", "statusCode": 400 }
```

## Qué NO cambió

- El código sigue siendo **400** (convención del módulo para reglas de negocio), no 409.
- `PATCH /medical-appointments/:id` con `{ "status": ... }` sigue aceptando cambios de estado sobre
  citas abiertas (`pending`, `confirmed`, `in_consultation`); el detalle lo usa para cancelar.
- Los endpoints `/cancel`, `/complete` y `/finish-consultation` siguen funcionando igual sobre
  citas abiertas.

## Checklist de migración

- [ ] En el listado y el detalle, ocultar "Editar"/"Reprogramar" cuando `status ∈ {completed, cancelled}`.
- [ ] Si la ruta de edición se abre igual (URL directa), mostrar el `error` del 400 y volver al detalle.
- [ ] No ofrecer "Finalizar consulta" sobre citas canceladas.
