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

## Decisiones

| Decisión | Por qué |
|---|---|
| Cupo diario = **suma** de `maxDailyAppointments` de los bloques activos del día en el centro | El campo vive en el bloque y la pantalla de horario lo conserva por bloque (`app` `f47efc1`); no hay un campo de médico ni una pantalla que lo edite. La suma no depende del orden de los bloques. Hoy ningún médico tiene dos bloques el mismo día en el mismo centro (consulta en la base), así que el valor efectivo no cambia |
| `medicalCenterId` **obligatorio** al agendar (400) y al reprogramar una cita sin centro (400) | Horario, turnos y cupo se configuran por centro; validar "contra cualquier bloque del día" no dice en qué centro estará el médico ni qué grilla de turnos aplica. En la base hay **0** citas sin centro (todas las vivas lo tienen), el seed siempre lo envía y el selector de turnos necesita el centro para `GET /availability` |
| El médico debe estar asignado al centro (400) | Un bloque en un centro del que el médico salió (MJ-15) seguiría aceptando citas |
| `GET /availability`: con el día lleno, todos los `slots` salen `available: false` | Misma forma; evita que el selector ofrezca un turno que el cupo diario rechazaría |
