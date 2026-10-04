# 2026-10-03-002 — Citas cerradas no editables

## Pedido
Una cita `completed` o `cancelled` no debe poder editarse ni reprogramarse vía `PATCH /medical-appointments/:id`.

## Hallazgo
- El reporte **no se reproduce**: `update()` ya rechaza ambos estados con 400 desde el commit inicial
  (`76549dd`). Verificado contra la API viva (cita APT-2026-00052 completada y APT-2026-00184 cancelada):
  edición de `reason` y de `appointmentDate` → 400, la cita queda igual.
- Faltaban tests de esa guarda: ahora existen y llaman al service real.
- Brecha real en la misma regla: `finishConsultation()` solo rechazaba `completed`; una cita
  `cancelled` se podía finalizar (creaba historial y la pasaba a `completed`). Corregido → 400.

## Decisiones
- Se mantiene **400** (convención del módulo: `cancel`/`complete` usan `BadRequestException`), no 409.
- Se mantienen los mensajes existentes del `update` para no romper textos ya mostrados por el front.
- No se bloquea `status` en el PATCH genérico: el detalle del front cancela con `PATCH {status}`.
  Queda como deuda: el PATCH permite `pending → completed` sin pasar por `finish-consultation`.

## Verificado
- `scripts/seed-demo.js` no usa el PATCH genérico: cancela con `/cancel`, finaliza citas `confirmed`
  con `/finish-consultation` y retrofecha con SQL directo. No lo afecta.
- `tsc` limpio; suite completa y verificación por API: ver commit.

## Pendiente
- Front: ocultar editar/reprogramar en citas cerradas (guía en
  `docs/info/2026-10-04-citas-cerradas-integracion-frontend.md`).
