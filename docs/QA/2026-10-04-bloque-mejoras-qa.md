# QA funcional — Bloque de mejoras (MJ-01..MJ-50, selector de turnos, reglas de horario/turno y correcciones de la verificación de HU)

> Fecha: 2026-10-04 · Ejecutor: QA funcional (agente) · Repos en rama `dt/modules`: `api-gestion-medica` `5e26600`, `app-gestion-medica` `d5cad74`, `detector-cancer-de-mama` `564458b`. No se modificó código fuente. No se hizo commit.

## 0. Fuente de verdad

**No hay HU de Confluence.** Las 41 HU de `app-gestion-medica/docs/HU/**` son **ingeniería inversa del código** (actualizadas el 2026-10-04 tras el bloque): sus RN-xx/CA-xx son la especificación de este informe, junto con `docs/plans/2026-10-04-mejoras-detectadas-hu.md` y las guías de integración `2026-10-04-*-integracion-frontend.md`. Un PASS significa "el sistema hace lo que describe la HU derivada", **no** "validado con negocio". Donde la HU y el comportamiento difieren se reporta como discrepancia (hallazgo H-05).

## 1. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Casos en la matriz | **404** |
| PASS | **385** → **394** tras el re-test (§9) |
| FAIL | **9** → **0** tras el re-test (§9) |
| BLOQUEADO | **10** |
| Hallazgos | 1 ALTA · 3 MEDIA · 3 BAJA (ver §5) |
| Suites | backend `jest --ci` **592/592** (76 suites) · front `ng test` **153/153** · detector `pytest` **30/30** · `ng build` bundle inicial **455,18 kB** (< 500 kB) |

**Veredicto:** el bloque cumple casi todas las reglas verificables por API (alcance por médico/centro, estados de cita, turnos y cupo diario en secuencia, cierre de consulta, análisis, bitácora, bloqueo de login, restablecimiento de contraseña), **pero no es apto para cierre sin corregir H-01 (ALTA): reservas concurrentes superan la capacidad del turno** (hasta 6 citas en un turno de capacidad 1). Además hay 500 en `availability`/`available-dates` ante parámetros mal formados (H-02), un código de error distinto al documentado en `PATCH` de cita con centro inexistente (H-03) y "BI-RADS" aún visible en la API para 22 análisis legados (H-04).

Casos BLOQUEADO (no ejecutados, motivo en cada fila): PAT-04g, PAT-04h, DCM-02, REC-13, RST-02, BLQ-01, BLQ-02, BLQ-03, BLQ-04, BLQ-05. `PAT-04g/h` nacieron de una expectativa mía equivocada (el enfermero no tiene `patient.actualizar`) y se reclasificaron; `HIST-03`, `AUTH-04`, `MAM-09`, `DAT-01`, `DAT-05`, `PAT-09a/b` también se corrigieron tras un primer resultado por expectativa o SQL errados (la fila final es la válida; el motivo está en "Evid.").

## 2. Ambiente

- `docker compose -f tesis/docker-compose.yml up -d --build` (backend, frontend y detector reconstruidos; Redis ya estaba arriba con contraseña). Contenedores: `medos-backend` :8008, `medos-frontend` :8007, `medos-ml-api` (no publicado; alcanzado por el backend), `medos-redis`. Todos `healthy`.
- BD: PostgreSQL `bd_gestion_medica` del host (datos de prueba). Credenciales leídas del entorno del contenedor, nunca impresas; consultas con `psql`.
- Usuarios demo (contraseña `Abc123456.`, `isSystemUser:false`): `cmendoza` (médica A), `rparedes` (médico B), `lgutierrez`, `enf.ramirez`, `enf.torres`, `admin.caracas`. Usuarios desechables creados para el QA (y borrados): `qa_doc1`, `qa_doc2` (médicos), `qa_nurse` (Ávila), `qa_nurse2` (Próceres), `qa_lock`, `qa_lock3`, `qa_reset`, `qa_first`, `qa_ok8`, `qa_rolechk`. El bloqueo de login se probó **solo** con credenciales desechables.
- Ejecución: scripts Python (`urllib`) contra `http://localhost:8008`, un token por usuario; cada caso guarda request/response reales y verifica la BD cuando escribe. Imágenes de mamografía: 3 JPG reales tomados de `uploads/` del backend y una variante generada con PIL (recorte 3 % + brillo +8 %).
- **Limitación del ambiente:** el `ThrottlerGuard` global (20 req/10 s por IP, bloqueo 60 s; 100 req/min, bloqueo 90 s) obligó a espaciar las peticiones (0,75 s). Las dos primeras ejecuciones de `APT-19/20` devolvieron 429 por mi propio ritmo y se repitieron con pausa (el registro conserva la corrida válida).
- No se corrió `seed --today`. Ningún dato demo se alteró de forma permanente (ver §8, limpieza y verificación: citas 321 = 321 del inicio).

## 3. Fixtures

Todos los datos QA llevan documento `QA…` o nombre `qa_…`/`QA …` y se eliminaron al final (§8). Resumen de lo creado: 2 médicos (`QA8000001/2`) con horario propio (lunes 08–10 cap. 2 / 1 por turno y 10–12 cap. 3 / 2 por turno), 5 usuarios enfermero, 18 pacientes `QA…` (la mayoría por `newPatientData`), 36 citas (turnos, transiciones y carreras), 4 historias, 4 recetas (5 ítems), 4 archivos y 4 análisis de mamografía vivos al cierre (más los retirados), 1 imagen de persona, 2 departamentos `QA Depto…`, 1 centro `QA Centro 409`, 2 roles `qa_rol_*`. Sobre filas demo solo se escribió: foto de `cmendoza` (`doctor_images`, revertida) y reenvío idéntico de sus centros.

## 4. Matriz de pruebas

Evidencia: la columna "Obtenido" es la salida real (código HTTP + mensaje y/o consulta SQL); la columna "Evid." resume el payload o la fila de BD cuando aporta algo distinto. Orden = orden de ejecución por módulo. Prefijos: APT cita (alta), CAP cupo/turnos/reprogramación, SCH horario, TR transiciones y cierre, HIST historia, REC receta, MAM archivos/análisis, AUTH/USR/FOTO/SES/RST cuentas, AUD bitácora, DOC/ROLE/MC/DEP/MENU administración, PAT pacientes, DASH panel, HLT salud, WALK recorrido de demo, CON/ABU concurrencia y abuso, DAT datos en BD, PREV vista previa, FE/BE/ML suites.

| ID | HU / MJ | Caso | Esperado | Obtenido | Evid. | Resultado |
|---|---|---|---|---|---|---|
| APT-01 | MJ-24 CA-07 | Alta sin medicalCenterId | 400 ["Indique el centro médico de la cita."] (1 mensaje) | 400 ['Indique el centro médico de la cita.'] | {"data": null, "error": ["Indique el centro médico de la cita."], "statusCode": 400} | **PASS** |
| APT-02 | MJ-24 | Alta con medicalCenterId no UUID | 400 mismo mensaje único | 400 ['Indique el centro médico de la cita.'] | {"data": null, "error": ["Indique el centro médico de la cita."], "statusCode": 400} | **PASS** |
| APT-03 | MJ-24 RN-08 | Centro inexistente | 404 Centro médico con ID … no encontrado | 404 Centro médico con ID 11111111-1111-4111-8111-111111111111 no encontrado. | {"data": null, "error": "Centro médico con ID 11111111-1111-4111-8111-111111111111 no encontrado.", "statusCode": 404} | **PASS** |
| APT-04 | MJ-24 CA-08 | cmendoza con centro Próceres (no asignado) | 400 El médico no está asignado a este centro médico. | 400 El médico no está asignado a este centro médico. | {"data": null, "error": "El médico no está asignado a este centro médico.", "statusCode": 400} | **PASS** |
| APT-04b | MJ-25 RN-06c | Rechazos APT-01..04 no dejan persona ni paciente | 0 personas, 0 pacientes con doc QA7000001 | 0 / 0 |  | **PASS** |
| APT-05 | MJ-24 CA-01 MJ-25 | Alta feliz lunes 09:00 (turno 13:00Z) con newPatientData | 201 pending, número APT, created_by = usuario, hora local 09:00 | 201 (previo) BD: APT-2026-00340 \| pending \| 2026-12-07 09:00:00 \| 30 \| t | APT-2026-00340 \| pending \| 2026-12-07 09:00:00 \| 30 \| t | **PASS** |
| APT-06 | CA-02 RN-06b | Turno 09:00 ya ocupado (1 paciente/turno), mismo inicio | 400 El turno de las 09:00 ya está completo: admite 1 paciente(s) y tiene 1. | 400 El turno de las 09:00 ya está completo: admite 1 paciente(s) y tiene 1. | {"data": null, "error": "El turno de las 09:00 ya está completo: admite 1 paciente(s) y tiene 1.", "statusCode": 400} | **PASS** |
| APT-06b | CA-02 | Inicio 09:15 solapa turno lleno | 400 turno completo | 400 El turno de las 09:00 ya está completo: admite 1 paciente(s) y tiene 1. | {"data": null, "error": "El turno de las 09:00 ya está completo: admite 1 paciente(s) y tiene 1.", "statusCode": 400} | **PASS** |
| APT-06c | CA-11 MJ-25 | Turno lleno con paciente nuevo: sin persona ni paciente huérfanos | 0 / 0 | 0 / 0 |  | **PASS** |
| APT-07 | RN-07 | Reserva al inicio exacto del bloque (08:00) | 201 | 201 APT-2026-00341 | {"code": 201, "data": {"id": "31ab65b2-05e2-4af0-acb0-67a098c2ba30", "appointmentNumber": "APT-2026-00341", "appointmentDate": "2026-12-07T12:00:00.0… | **PASS** |
| APT-08 | RN-07 | Último turno 15:30-16:00 (termina a la hora de cierre) | 201 | 201 APT-2026-00342 | {"code": 201, "data": {"id": "a68aa136-65db-4e76-876f-fad9da19f3b5", "appointmentNumber": "APT-2026-00342", "appointmentDate": "2026-12-07T19:30:00.0… | **PASS** |
| APT-09 | RN-07 | Sobrepasa el cierre: 15:30 + 45 min (martes) | 400 hora no dentro del horario | 400 La hora 15:30 no está dentro del horario del doctor en este centro médico. | {"data": null, "error": "La hora 15:30 no está dentro del horario del doctor en este centro médico.", "statusCode": 400} | **PASS** |
| APT-09b | RN-06c | Rechazo overrun no deja persona | 0 | 0 |  | **PASS** |
| APT-10 | RN-07 | Inicio a la hora de cierre (16:00) | 400 | 400 La hora 16:00 no está dentro del horario del doctor en este centro médico. | {"data": null, "error": "La hora 16:00 no está dentro del horario del doctor en este centro médico.", "statusCode": 400} | **PASS** |
| APT-10b | RN-07 | Inicio antes de la apertura (07:30) | 400 | 400 La hora 07:30 no está dentro del horario del doctor en este centro médico. | {"data": null, "error": "La hora 07:30 no está dentro del horario del doctor en este centro médico.", "statusCode": 400} | **PASS** |
| APT-11 | CA-03 | Domingo sin horario | 400 El doctor no tiene horario configurado para el día Domingo… | 400 El doctor no tiene horario configurado para el día Domingo en este centro médico. | {"data": null, "error": "El doctor no tiene horario configurado para el día Domingo en este centro médico.", "statusCode": 400} | **PASS** |
| APT-12 | CA-05 RN-03 | Fecha pasada | 400 no puede ser en el pasado | 400 La fecha de la cita no puede ser en el pasado. | {"data": null, "error": "La fecha de la cita no puede ser en el pasado.", "statusCode": 400} | **PASS** |
| APT-13 | CA-10 MJ-26 | Alta con status completed | 400 estado inicial solo pending/confirmed | 400 ['Una cita nueva solo puede crearse como pendiente (pending) o confirmada (confirmed).'] | {"data": null, "error": ["Una cita nueva solo puede crearse como pendiente (pending) o confirmada (confirmed)."], "statusCode": 400} | **PASS** |
| APT-13b | MJ-26 | Alta con status in_consultation | 400 | 400 ['Una cita nueva solo puede crearse como pendiente (pending) o confirmada (confirmed).'] | {"data": null, "error": ["Una cita nueva solo puede crearse como pendiente (pending) o confirmada (confirmed)."], "statusCode": 400} | **PASS** |
| APT-13c | RN-06c | Rechazos de estado no dejan persona | 0 | 0 |  | **PASS** |
| APT-14 | MJ-26 | Alta con status confirmed | 201 y status confirmed en BD | 201 BD=confirmed | {"code": 201, "data": {"id": "35e29c21-67f2-4d5a-a8e4-08c8f0d03ffa", "appointmentNumber": "APT-2026-00343", "appointmentDate": "2026-12-08T13:00:00.0… | **PASS** |
| APT-15 | CA-09 RN-11 | cmendoza agenda a nombre de rparedes | 403 Un médico solo puede agendar citas a su nombre. | 403 Un médico solo puede agendar citas a su nombre. | {"data": null, "error": "Un médico solo puede agendar citas a su nombre.", "statusCode": 403} | **PASS** |
| APT-15b | CA-09 | 403 antes de crear paciente | 0 / 0 | 0 / 0 |  | **PASS** |
| APT-16 | CA-09 RN-11 | admin.caracas agenda a nombre de rparedes (mié 09:00) | 201 created_by = admin | 201 created_by_ok=t | {"code": 201, "data": {"id": "64a0a29e-50b1-46e2-afb2-dde28a01b05f", "appointmentNumber": "APT-2026-00344", "appointmentDate": "2026-12-09T13:00:00.0… | **PASS** |
| APT-17 | RN-02 | durationMinutes 4 (<5) | 400 | 400 ['durationMinutes must not be less than 5'] | {"data": null, "error": ["durationMinutes must not be less than 5"], "statusCode": 400} | **PASS** |
| APT-18 | RN-01 | Sin type ni reason | 400 | 400 ['type must be one of the following values: first_visit, follow_up, emergency', 'El tipo de cita es requerido.', 'reason must be a string', 'El motivo de la cita es requerido.'] | {"data": null, "error": ["type must be one of the following values: first_visit, follow_up, emergency", "El tipo de cita es requerido.", "reason must… | **PASS** |
| APT-19 | AUTH | Sin token | 401 | 401 Token requerido para esta petición | {"data": null, "error": "Token requerido para esta petición", "statusCode": 401} | **PASS** |
| APT-20 | permisos | Enfermero agenda (sin appointments.crear) | 403 | 403 No tienes permisos. Se requiere uno de: appointments.crear | {"data": null, "error": "No tienes permisos. Se requiere uno de: appointments.crear", "statusCode": 403} | **PASS** |
| APT-20b | RN-06c | Rechazos 17-20 sin huérfanos | 0 | 0 |  | **PASS** |
| SCH-01 | MJ-19 HU-03.2 | Admin define 2 bloques lunes (cap 2 y 3, 1 y 2 por turno) | 200; BD con 2 filas y maxDailyAppointments por bloque (2 y 3) | 201; BD='1 \| 08:00:00 \| 10:00:00 \| 30 \| 1 \| 2 \| t \| 3e6d7175-75a9-4e8b-b973-f5c41f3a362a\r\n1 \| 10:00:00 \| 12:00:00 \| 30 \| 2 \| 3 \| t \| 3e6d7175-75a9-4e8b-b973-f5c41f3a362a' | {"code": 201, "data": [{"doctorId": "4c80b7fc-6a73-41c3-9929-b4abb8df4ea0", "medicalCenterId": "3e6d7175-75a9-4e8b-b973-f5c41f3a362a", "dayOfWeek": 1… | **PASS** |
| SCH-02 | commit 855cb01 | Bloque en centro Guaparo (qa_doc1 no asignado), por administrador | 400 El médico no está asignado a ese centro médico. | 400 El médico no está asignado a ese centro médico. | {"data": null, "error": "El médico no está asignado a ese centro médico.", "statusCode": 400} | **PASS** |
| SCH-03 | 4a10e09 | Dos bloques solapados en el mismo payload (mar 08-10 y 09-11) | 400 El bloque … se solapa con otro bloque | 400 El bloque Martes 09:00–11:00 se solapa con otro bloque del médico (08:00–10:00). | {"data": null, "error": "El bloque Martes 09:00–11:00 se solapa con otro bloque del médico (08:00–10:00).", "statusCode": 400} | **PASS** |
| SCH-03b | atómico | El rechazo atómico deja intacto el horario previo | BD igual a la de SCH-01 | igual | 1 \| 08:00:00 \| 10:00:00 \| 30 \| 1 \| 2 \| t \| 3e6d7175-75a9-4e8b-b973-f5c41f3a362a | **PASS** |
| SCH-04 | 4a10e09 atómico | Reemplazo con 1 bloque válido + 1 solapado | 400 y no queda ningún bloque nuevo (ni se pierden los previos) | 400; BD igual=True | {"data": null, "error": "El bloque Miércoles 08:30–09:30 se solapa con otro bloque del médico (08:00–09:00).", "statusCode": 400} | **PASS** |
| DOC-00 | MJ-17 | Admin agrega Los Próceres a qa_doc1 (cambio de centros) | 200 | 200 ok | {"code": 200, "data": {"id": "4c80b7fc-6a73-41c3-9929-b4abb8df4ea0", "commonPersonId": "2a5f47b8-bc74-432c-97cb-0030318c6aae", "licenseNumber": "QA-L… | **PASS** |
| SCH-05 | 4a10e09 cualquier centro | Bloque lunes 09-11 en Próceres solapa con bloques de Ávila (otro centro) | 400 se solapa | 400 El bloque Lunes 09:00–11:00 se solapa con otro bloque del médico (08:00–10:00). | {"data": null, "error": "El bloque Lunes 09:00–11:00 se solapa con otro bloque del médico (08:00–10:00).", "statusCode": 400} | **PASS** |
| SCH-05b | 4a10e09 | Bloque lunes 12-14 en Próceres (adyacente, sin solape) | 200 | 201 ok | {"code": 201, "data": [{"doctorId": "4c80b7fc-6a73-41c3-9929-b4abb8df4ea0", "medicalCenterId": "7be4b22c-328c-4553-b292-9a22756ae9e1", "dayOfWeek": 1… | **PASS** |
| SCH-06 | MJ-18 | qa_doc2 (médico) reescribe el horario de qa_doc1 | 403 Solo puede gestionar su propio horario. | 403 Solo puede gestionar su propio horario. | {"data": null, "error": "Solo puede gestionar su propio horario.", "statusCode": 403} | **PASS** |
| SCH-06b | MJ-18 | cmendoza reescribe el horario de qa_doc1 | 403 | 403 Solo puede gestionar su propio horario. | {"data": null, "error": "Solo puede gestionar su propio horario.", "statusCode": 403} | **PASS** |
| SCH-07 | MJ-18 | qa_doc2 edita un bloque de qa_doc1 | 403 | 403 Solo puede gestionar su propio horario. | {"data": null, "error": "Solo puede gestionar su propio horario.", "statusCode": 403} | **PASS** |
| SCH-08 | MJ-18 | qa_doc2 borra un bloque de qa_doc1 | 403 y bloque sigue vivo | 403 Solo puede gestionar su propio horario. | {"data": null, "error": "Solo puede gestionar su propio horario.", "statusCode": 403} | **PASS** |
| SCH-09 | MJ-18 | qa_doc1 reescribe su propio horario (mismo conjunto) | 200 | 201 | {"code": 201, "data": [{"doctorId": "4c80b7fc-6a73-41c3-9929-b4abb8df4ea0", "medicalCenterId": "3e6d7175-75a9-4e8b-b973-f5c41f3a362a", "dayOfWeek": 1… | **PASS** |
| SCH-10 | DTO | slotDurationMinutes 5 (<10) | 400 | 400 ['blocks.0.slotDurationMinutes must not be less than 10'] | {"data": null, "error": ["blocks.0.slotDurationMinutes must not be less than 10"], "statusCode": 400} | **PASS** |
| SCH-11 | DTO | dayOfWeek 7 | 400 | 400 ['blocks.0.dayOfWeek máximo es 6 (Sábado)'] | {"data": null, "error": ["blocks.0.dayOfWeek máximo es 6 (Sábado)"], "statusCode": 400} | **PASS** |
| SCH-12 | RN | Fin anterior al inicio | 400 | 400 La hora de inicio (10:00:00) debe ser anterior a la hora de fin (08:00:00) | {"data": null, "error": "La hora de inicio (10:00:00) debe ser anterior a la hora de fin (08:00:00)", "statusCode": 400} | **PASS** |
| SCH-13 | DTO | maxPatientsPerSlot 11 (>10) | 400 | 400 ['blocks.0.maxPatientsPerSlot must not be greater than 10'] | {"data": null, "error": ["blocks.0.maxPatientsPerSlot must not be greater than 10"], "statusCode": 400} | **PASS** |
| SCH-14 | permisos | Enfermero define horario | 403 | 403 No tienes permisos. Se requiere uno de: doctors.actualizar | {"data": null, "error": "No tienes permisos. Se requiere uno de: doctors.actualizar", "statusCode": 403} | **PASS** |
| SCH-15 | AUTH | Sin token | 401 | 401 | {"data": null, "error": "Token requerido para esta petición", "statusCode": 401} | **PASS** |
| CAP-01 | MJ-24 | qa_doc1 lunes 14-dic turno 08:00 (1 por turno, bloque A cap 2) | 201 | 201 | {"code": 201, "data": {"id": "39cd89e4-c883-4da5-b8b3-41648d6048fc", "appointmentNumber": "APT-2026-00345", "appointmentDate": "2026-12-14T12:00:00.0… | **PASS** |
| CAP-02 | RN-06b | Mismo turno 08:00 otra vez (capacidad 1) | 400 turno completo, admite 1 | 400 El turno de las 08:00 ya está completo: admite 1 paciente(s) y tiene 1. | {"data": null, "error": "El turno de las 08:00 ya está completo: admite 1 paciente(s) y tiene 1.", "statusCode": 400} | **PASS** |
| CAP-03 | RN-06b | Turno 08:30 (segunda cita del bloque A) | 201 | 201 | {"code": 201, "data": {"id": "dae77e82-2b6b-440a-821f-aabf44d70b00", "appointmentNumber": "APT-2026-00346", "appointmentDate": "2026-12-14T12:30:00.0… | **PASS** |
| CAP-04 | RN-06b | Bloque B 10:00 primera cita (2 por turno) | 201 | 201 | {"code": 201, "data": {"id": "4c9b8907-ffce-4ce9-bd7f-8e1190b4bff8", "appointmentNumber": "APT-2026-00347", "appointmentDate": "2026-12-14T14:00:00.0… | **PASS** |
| CAP-05 | RN-06b | Bloque B 10:00 segunda cita en el mismo turno (capacidad 2) | 201 | 201  | {"code": 201, "data": {"id": "3d86d95b-afa8-45c5-99a5-b90b79d4a311", "appointmentNumber": "APT-2026-00348", "appointmentDate": "2026-12-14T14:00:00.0… | **PASS** |
| CAP-06 | RN-06b | Bloque B 10:00 tercera cita (turno lleno 2/2) | 400 admite 2 paciente(s) y tiene 2 | 400 El turno de las 10:00 ya está completo: admite 2 paciente(s) y tiene 2. | {"data": null, "error": "El turno de las 10:00 ya está completo: admite 2 paciente(s) y tiene 2.", "statusCode": 400} | **PASS** |
| CAP-06b | CA-11 | Rechazo no deja persona huérfana (QA9100005) | 0 / 0 | 0 / 0 |  | **PASS** |
| CAP-07 | turn picker | availability: turno 10:00 capacity=2 booked=2 available=false; 08:00 capacity=1 booked=1 | contrato de turnos | {'start': '2026-12-14T14:00:00.000Z', 'end': '2026-12-14T14:30:00.000Z', 'capacity': 2, 'booked': 2, 'available': False} | {"start": "2026-12-14T14:00:00.000Z", "end": "2026-12-14T14:30:00.000Z", "capacity": 2, "booked": 2, "available": false} | **PASS** |
| CAP-07b | turn picker | availability: 8 turnos del bloque 08-12 (2 bloques x 4) | 8 slots, currentCount=4 | 8 slots currentCount=4 available=True | {"occupiedSlots": [{"start": "2026-12-14T12:00:00.000Z", "end": "2026-12-14T12:30:00.000Z", "appointmentNumber": "APT-2026-00345"}, {"start": "2026-1… | **PASS** |
| CAP-07c | contrato | schedule[] trae maxDailyAppointments por bloque (2 y 3) | [2,3] | [2, 3] | [{"startTime": "08:00:00", "endTime": "10:00:00", "maxDailyAppointments": 2}, {"startTime": "10:00:00", "endTime": "12:00:00", "maxDailyAppointments"… | **PASS** |
| CAP-08 | a8f71e7 | available-dates lunes 14: slotsAvailable = min(cupo 5 - 4 citas, turnos libres) = 1 | 1 | [{'date': '2026-12-14', 'dayOfWeek': 1, 'slotsAvailable': 1}] | {"code": 200, "data": [{"date": "2026-12-14", "dayOfWeek": 1, "slotsAvailable": 1}]} | **PASS** |
| CAP-09 | MJ-24 suma de bloques | 5ª cita del día (cupo diario = 2+3 = 5) en turno libre 10:30 | 201 | 201  | {"code": 201, "data": {"id": "8bc2eae7-17e6-4dee-a855-a7bd6d066457", "appointmentNumber": "APT-2026-00349", "appointmentDate": "2026-12-14T14:30:00.0… | **PASS** |
| CAP-10 | MJ-24 CA-06 | 6ª cita del día (turno 11:00 libre, pero cupo diario 5) | 400 El doctor ya alcanzó el máximo de 5 citas para este día en este centro médico. | 400 El doctor ya alcanzó el máximo de 5 citas para este día en este centro médico. | {"data": null, "error": "El doctor ya alcanzó el máximo de 5 citas para este día en este centro médico.", "statusCode": 400} | **PASS** |
| CAP-10b | CA-11 | Rechazo por cupo diario sin huérfanos | 0 / 0 | 0 / 0 |  | **PASS** |
| CAP-11 | CA-06 turn picker | Día lleno: availability marca TODOS los slots available=false y available=false | todos false | slots false=True available=False currentCount=5 | {"occupiedSlots": [{"start": "2026-12-14T12:00:00.000Z", "end": "2026-12-14T12:30:00.000Z", "appointmentNumber": "APT-2026-00345"}, {"start": "2026-1… | **PASS** |
| CAP-12 | a8f71e7 | available-dates con día lleno | no lista el 14 o slotsAvailable=0 | [] | {"code": 200, "data": []} | **PASS** |
| CAP-13 | reprogramar | Reprogramar al turno 10:00 lleno | 400 turno completo | 400 El turno de las 10:00 ya está completo: admite 2 paciente(s) y tiene 2. | {"data": null, "error": "El turno de las 10:00 ya está completo: admite 2 paciente(s) y tiene 2.", "statusCode": 400} | **PASS** |
| CAP-14 | MJ-24 patch | Reprogramar sin medicalCenterId la cita QUE tiene centro (se conserva) | 200 | 200  | {"code": 200, "data": {"id": "8bc2eae7-17e6-4dee-a855-a7bd6d066457", "appointmentNumber": "APT-2026-00349", "appointmentDate": "2026-12-14T14:30:00.0… | **PASS** |
| CAP-15 | MJ-24 patch | Reprogramar con centro Próceres (qa_doc1 sí asignado, bloque lunes 12-14, hora 10:30 fuera) | 400 fuera de horario | 400 La hora 10:30 no está dentro del horario del doctor en este centro médico. | {"data": null, "error": "La hora 10:30 no está dentro del horario del doctor en este centro médico.", "statusCode": 400} | **PASS** |
| CAP-16 | MJ-24 patch | Reprogramar con centro Guaparo (médico no asignado) | 400 no asignado | 400 El médico no está asignado a este centro médico. | {"data": null, "error": "El médico no está asignado a este centro médico.", "statusCode": 400} | **PASS** |
| CAP-17 | MJ-24 patch | Reprogramar con centro inexistente | 404 | 400 El médico no está asignado a este centro médico. | {"data": null, "error": "El médico no está asignado a este centro médico.", "statusCode": 400} | **FAIL** |
| CAP-18 | timezone | Reprogramar a 11:30 (turno libre, aún cupo diario 5 con la misma cita) | 200 y BD 11:30 local; respuesta 15:30Z (sin desfase de 4 h) | 200 BD=2026-12-14 11:30:00 resp=2026-12-14T15:30:00.000Z | {"code": 200, "data": {"id": "8bc2eae7-17e6-4dee-a855-a7bd6d066457", "appointmentNumber": "APT-2026-00349", "appointmentDate": "2026-12-14T15:30:00.0… | **PASS** |
| CAP-19 | cupo | Cancelar libera cupo: tras cancelar, se puede reservar de nuevo el 5º lugar | cancel 200 y alta 201 | cancel=200 alta=201  | {"code": 201, "data": {"id": "03376c3c-6162-4380-a7f7-6fa6f1b05175", "appointmentNumber": "APT-2026-00350", "appointmentDate": "2026-12-14T15:00:00.0… | **PASS** |
| TR-01 | MJ-26 CA | PATCH con status=completed | 400 mensaje "no se cambia por este endpoint"; estado intacto | 400 ['El estado de la cita no se cambia por este endpoint. Use /confirm, /start-consultation, /cancel o /finish-consultation.'] BD=pending | {"data": null, "error": ["El estado de la cita no se cambia por este endpoint. Use /confirm, /start-consultation, /cancel o /finish-consultation."], … | **PASS** |
| TR-02 | MJ-26 | PATCH con cancellationReason | 400 "use /cancel"; sin cambios | 400 ['Para cancelar la cita use PATCH /medical-appointments/:id/cancel.'] | {"data": null, "error": ["Para cancelar la cita use PATCH /medical-appointments/:id/cancel."], "statusCode": 400} | **PASS** |
| TR-03 | MJ-26 | start-consultation sobre pending | 400 Solo se puede iniciar la consulta de una cita confirmada. | 400 Solo se puede iniciar la consulta de una cita confirmada. | {"data": null, "error": "Solo se puede iniciar la consulta de una cita confirmada.", "statusCode": 400} | **PASS** |
| TR-04 | be94683 MJ-29 | finish-consultation sobre pending | 400 Solo se puede finalizar… confirmada o en consulta; sin historia creada | 400 Solo se puede finalizar la consulta de una cita confirmada o en consulta. hist=0 | {"data": null, "error": "Solo se puede finalizar la consulta de una cita confirmada o en consulta.", "statusCode": 400} | **PASS** |
| TR-05 | MJ-26 | confirm sobre pending | 200; BD confirmed | 200 BD=confirmed | {"code": 200, "data": {"id": "0e9a9820-2bad-47ed-9625-536414882531", "appointmentNumber": "APT-2026-00340", "appointmentDate": "2026-12-07T13:00:00.0… | **PASS** |
| TR-06 | MJ-26 | confirm de nuevo (ya confirmed) | 400 Solo se puede confirmar una cita programada. | 400 Solo se puede confirmar una cita programada. | {"data": null, "error": "Solo se puede confirmar una cita programada.", "statusCode": 400} | **PASS** |
| TR-07 | MJ-26 | start-consultation sobre confirmed | 200; BD in_consultation | 200 BD=in_consultation | {"code": 200, "data": {"id": "0e9a9820-2bad-47ed-9625-536414882531", "appointmentNumber": "APT-2026-00340", "appointmentDate": "2026-12-07T13:00:00.0… | **PASS** |
| TR-08 | MJ-26 | start-consultation repetido | 400 | 400 Solo se puede iniciar la consulta de una cita confirmada. | {"data": null, "error": "Solo se puede iniciar la consulta de una cita confirmada.", "statusCode": 400} | **PASS** |
| TR-09 | 05.3 | "Guardar progreso": PATCH observations en in_consultation | 200 y BD observations | 200 obs=Guardar progreso QA | {"code": 200, "data": {"id": "0e9a9820-2bad-47ed-9625-536414882531", "appointmentNumber": "APT-2026-00340", "appointmentDate": "2026-12-07T13:00:00.0… | **PASS** |
| TR-10a | MJ-30 | cancel sin cuerpo | 400 motivo requerido; la cita sigue pending | 400 ['El motivo de cancelación es requerido.', 'cancellationReason must be a string'] BD=pending | {"data": null, "error": ["El motivo de cancelación es requerido.", "cancellationReason must be a string"], "statusCode": 400} | **PASS** |
| TR-10b | MJ-30 | cancel vacío | 400 motivo requerido; la cita sigue pending | 400 ['El motivo de cancelación es requerido.'] BD=pending | {"data": null, "error": ["El motivo de cancelación es requerido."], "statusCode": 400} | **PASS** |
| TR-10c | MJ-30 | cancel solo espacios | 400 motivo requerido; la cita sigue pending | 400 ['El motivo de cancelación es requerido.'] BD=pending | {"data": null, "error": ["El motivo de cancelación es requerido."], "statusCode": 400} | **PASS** |
| TR-10d | MJ-30 | cancel tab/newline | 400 motivo requerido; la cita sigue pending | 400 ['El motivo de cancelación es requerido.'] BD=pending | {"data": null, "error": ["El motivo de cancelación es requerido."], "statusCode": 400} | **PASS** |
| TR-11 | MJ-30 | cancel con motivo con espacios alrededor | 200; BD cancelled y motivo recortado | 200 BD='cancelled \| Paciente no asistió' | {"code": 200, "data": {"id": "31ab65b2-05e2-4af0-acb0-67a098c2ba30", "appointmentNumber": "APT-2026-00341", "appointmentDate": "2026-12-07T12:00:00.0… | **PASS** |
| TR-12 | CA cerradas | PATCH sobre cita cancelada | 400 No se puede modificar una cita cancelada. | 400 No se puede modificar una cita cancelada. | {"data": null, "error": "No se puede modificar una cita cancelada.", "statusCode": 400} | **PASS** |
| TR-12b | CA cerradas | Reprogramar cita cancelada | 400 | 400 No se puede modificar una cita cancelada. | {"data": null, "error": "No se puede modificar una cita cancelada.", "statusCode": 400} | **PASS** |
| TR-13 | MJ-29 | finish-consultation sobre cancelada | 400 No se puede finalizar una cita cancelada.; sin historia | 400 No se puede finalizar una cita cancelada. | {"data": null, "error": "No se puede finalizar una cita cancelada.", "statusCode": 400} | **PASS** |
| TR-13b | MJ-26 | confirm sobre cancelada | 400 | 400 Solo se puede confirmar una cita programada. | {"data": null, "error": "Solo se puede confirmar una cita programada.", "statusCode": 400} | **PASS** |
| TR-14 | be94683 | PATCH /:id/complete | 404 | 404 Cannot PATCH /medical-appointments/0e9a9820-2bad-47ed-9625-536414882531/complete | {"data": null, "error": "Cannot PATCH /medical-appointments/0e9a9820-2bad-47ed-9625-536414882531/complete", "statusCode": 404} | **PASS** |
| TR-15-confirm | MJ-27 | rparedes confirm sobre cita de cmendoza | 403 Solo el médico asignado puede modificar esta cita. | 403 Solo el médico asignado puede modificar esta cita. BD=pending | {"data": null, "error": "Solo el médico asignado puede modificar esta cita.", "statusCode": 403} | **PASS** |
| TR-15-start-consultation | MJ-27 | rparedes start-consultation sobre cita de cmendoza | 403 Solo el médico asignado puede modificar esta cita. | 403 Solo el médico asignado puede modificar esta cita. BD=pending | {"data": null, "error": "Solo el médico asignado puede modificar esta cita.", "statusCode": 403} | **PASS** |
| TR-15-cancel | MJ-27 | rparedes cancel sobre cita de cmendoza | 403 Solo el médico asignado puede modificar esta cita. | 403 Solo el médico asignado puede modificar esta cita. BD=pending | {"data": null, "error": "Solo el médico asignado puede modificar esta cita.", "statusCode": 403} | **PASS** |
| TR-15-finish | MJ-27 | rparedes finish sobre cita de cmendoza | 403 Solo el médico asignado puede modificar esta cita. | 403 Solo el médico asignado puede modificar esta cita. BD=pending | {"data": null, "error": "Solo el médico asignado puede modificar esta cita.", "statusCode": 403} | **PASS** |
| TR-15-PATCH | MJ-27 | rparedes PATCH datos sobre cita de cmendoza | 403 Solo el médico asignado puede modificar esta cita. | 403 Solo el médico asignado puede modificar esta cita. BD=pending | {"data": null, "error": "Solo el médico asignado puede modificar esta cita.", "statusCode": 403} | **PASS** |
| TR-15-reasignar | MJ-27 | rparedes reasigna a sí mismo la cita de cmendoza | 403 | 403 Solo el médico asignado puede modificar esta cita. doc=c5104979-23ae-45a7-aeb1-199baa3c48f8 | {"data": null, "error": "Solo el médico asignado puede modificar esta cita.", "statusCode": 403} | **PASS** |
| TR-15-delete | MJ-27 | rparedes DELETE sobre cita de cmendoza | 403 | 403 No tienes permisos. Se requiere uno de: appointments.eliminar | {"data": null, "error": "No tienes permisos. Se requiere uno de: appointments.eliminar", "statusCode": 403} | **PASS** |
| TR-15-reasignar2 | MJ-27 | cmendoza reasigna su cita a rparedes | 403 (médico no admin) | 403 Solo el médico asignado puede modificar esta cita. | {"data": null, "error": "Solo el médico asignado puede modificar esta cita.", "statusCode": 403} | **PASS** |
| TR-16 | permisos | Enfermero confirma cita | 403 | 403 No tienes permisos. Se requiere uno de: appointments.actualizar | {"data": null, "error": "No tienes permisos. Se requiere uno de: appointments.actualizar", "statusCode": 403} | **PASS** |
| TR-17 | MJ-50 | Enfermero finaliza consulta (sin medical-history.crear) | 403 | 403 No tienes permisos. Se requiere uno de: medical-history.crear | {"data": null, "error": "No tienes permisos. Se requiere uno de: medical-history.crear", "statusCode": 403} | **PASS** |
| TR-18-31 exá | MJ-31 | finish con requestedExams: 31 exámenes | 400; cita sigue in_consultation | 400 ['medicalHistory.requestedExams must contain no more than 30 elements'] BD=in_consultation | {"data": null, "error": ["medicalHistory.requestedExams must contain no more than 30 elements"], "statusCode": 400} | **PASS** |
| TR-18-name d | MJ-31 | finish con requestedExams: name de 201 caracteres | 400; cita sigue in_consultation | 400 ['medicalHistory.requestedExams.0.name must be shorter than or equal to 200 characters'] BD=in_consultation | {"data": null, "error": ["medicalHistory.requestedExams.0.name must be shorter than or equal to 200 characters"], "statusCode": 400} | **PASS** |
| TR-18-notes | MJ-31 | finish con requestedExams: notes de 501 caracteres | 400; cita sigue in_consultation | 400 ['medicalHistory.requestedExams.0.notes must be shorter than or equal to 500 characters'] BD=in_consultation | {"data": null, "error": ["medicalHistory.requestedExams.0.notes must be shorter than or equal to 500 characters"], "statusCode": 400} | **PASS** |
| TR-18-name v | MJ-31 | finish con requestedExams: name vacío | 400; cita sigue in_consultation | 400 ['medicalHistory.requestedExams.0.El nombre del examen es requerido.'] BD=in_consultation | {"data": null, "error": ["medicalHistory.requestedExams.0.El nombre del examen es requerido."], "statusCode": 400} | **PASS** |
| TR-19 | MJ-31 MJ-50 06.1 | finish-consultation feliz (con historia, exámenes y receta) | 200; cita completed; historia completed con observations y requested_exams (2); ítems con quantity 3 y 1 (default) | 200; cita=completed; hist=completed\|Observaciones de la historia QA\|2 exámenes; items='Ibuprofeno \| 1\r\nParacetamol \| 3' | Ibuprofeno \| 1 | **PASS** |
| TR-20 | MJ-29 | finish de nuevo sobre completada | 400 La cita ya está completada. | 400 La cita ya está completada. | {"data": null, "error": "La cita ya está completada.", "statusCode": 400} | **PASS** |
| TR-21 | CA cerradas | PATCH sobre completada | 400 No se puede modificar una cita ya completada. | 400 No se puede modificar una cita ya completada. | {"data": null, "error": "No se puede modificar una cita ya completada.", "statusCode": 400} | **PASS** |
| TR-21b | CA cerradas | Reprogramar completada | 400 | 400 No se puede modificar una cita ya completada. | {"data": null, "error": "No se puede modificar una cita ya completada.", "statusCode": 400} | **PASS** |
| TR-22 | CA cerradas | cancel sobre completada | 400 No se puede cancelar una cita ya completada. | 400 No se puede cancelar una cita ya completada. | {"data": null, "error": "No se puede cancelar una cita ya completada.", "statusCode": 400} | **PASS** |
| TR-22b | 06.1 | Una sola historia por cita tras los reintentos | 1 | 1 |  | **PASS** |
| TR-23 | MJ-50 | finish desde confirmed (sin start), sin exámenes ni receta | 200; cita completed; historia completed | 200 cita=completed hist=completed \| | {"code": 200, "data": {"id": "35e29c21-67f2-4d5a-a8e4-08c8f0d03ffa", "appointmentNumber": "APT-2026-00343", "appointmentDate": "2026-12-08T13:00:00.0… | **PASS** |
| HIST-01 | MJ-31 MJ-41 | GET /medical-history/patient/:id devuelve requestedExams y status completed | 200; 1 historia; requestedExams con 2 elementos | 200 n=1 ex=[{'name': 'Mamografía bilateral', 'notes': 'Control anual'}, {'name': 'Ecografía mamaria'}] status=completed | {"code": 200, "data": [{"id": "3c9787ca-1767-47f5-b793-c35b8af89624", "patientId": "93a26b4d-fc98-4790-b714-37e2b4b440b8", "doctorId": "c5104979-23ae… | **PASS** |
| HIST-02-patientId | MJ-27 | PATCH historia con patientId distinto | 400 "<campo> no se puede cambiar…"; BD sin cambios | 400 ['patientId no se puede cambiar: la historia queda ligada a su paciente, médico y cita.'] BD=93a26b4d-fc98-4790-b714-37e2b4b440b8 \| c5104979-23ae-45a7-aeb1-199baa3c48f8 \| 0e9a9820-2bad-47ed-9625-536414882531 | {"data": null, "error": ["patientId no se puede cambiar: la historia queda ligada a su paciente, médico y cita."], "statusCode": 400} | **PASS** |
| HIST-02-doctorId | MJ-27 | PATCH historia con doctorId distinto | 400 "<campo> no se puede cambiar…"; BD sin cambios | 400 ['doctorId no se puede cambiar: la historia queda ligada a su paciente, médico y cita.'] BD=93a26b4d-fc98-4790-b714-37e2b4b440b8 \| c5104979-23ae-45a7-aeb1-199baa3c48f8 \| 0e9a9820-2bad-47ed-9625-536414882531 | {"data": null, "error": ["doctorId no se puede cambiar: la historia queda ligada a su paciente, médico y cita."], "statusCode": 400} | **PASS** |
| HIST-02-medicalAppointmentId | MJ-27 | PATCH historia con medicalAppointmentId distinto | 400 "<campo> no se puede cambiar…"; BD sin cambios | 400 ['medicalAppointmentId no se puede cambiar: la historia queda ligada a su paciente, médico y cita.'] BD=93a26b4d-fc98-4790-b714-37e2b4b440b8 \| c5104979-23ae-45a7-aeb1-199baa3c48f8 \| 0e9a9820-2bad-47ed-9625-536414882531 | {"data": null, "error": ["medicalAppointmentId no se puede cambiar: la historia queda ligada a su paciente, médico y cita."], "statusCode": 400} | **PASS** |
| HIST-03 | HU-06.3 CA-03 / MJ-50 | PATCH sobre historia completed (la creada por el cierre) | 400 No se puede actualizar una consulta que ya ha sido completada… (HU-06.3 CA-03) | 400 No se puede actualizar una consulta que ya ha sido completada o cancelada. | nota: HIST-03 inicial esperaba 200; la HU exige 400 | **PASS** |
| HIST-04 | MJ-27 | rparedes PATCH historia de cmendoza | 403 Solo el médico asignado puede modificar este historial médico. | 403 Solo el médico asignado puede modificar este historial médico. | {"data": null, "error": "Solo el médico asignado puede modificar este historial médico.", "statusCode": 403} | **PASS** |
| HIST-05 | MJ-27 | POST historia con cita de otro paciente | 400 patientId y doctorId deben ser los de la cita indicada. | 400 patientId y doctorId deben ser los de la cita indicada. | {"data": null, "error": "patientId y doctorId deben ser los de la cita indicada.", "statusCode": 400} | **PASS** |
| HIST-06 | MJ-27 | rparedes POST historia sobre la cita de cmendoza (con su propio doctorId) | 400/403 (no se acepta) | 400 patientId y doctorId deben ser los de la cita indicada. | {"data": null, "error": "patientId y doctorId deben ser los de la cita indicada.", "statusCode": 400} | **PASS** |
| HIST-07 | MJ-31 | POST historia con 31 exámenes | 400 máx 30 | 400 ['requestedExams must contain no more than 30 elements'] | {"data": null, "error": ["requestedExams must contain no more than 30 elements"], "statusCode": 400} | **PASS** |
| REC-01-medicalAppointmentId | MJ-28 PATCH | PATCH receta con medicalAppointmentId | 400 "<campo> no se puede cambiar en una receta emitida."; BD igual | 400 ['medicalAppointmentId no se puede cambiar en una receta emitida.'] | {"data": null, "error": ["medicalAppointmentId no se puede cambiar en una receta emitida."], "statusCode": 400} | **PASS** |
| REC-01-patientId | MJ-28 PATCH | PATCH receta con patientId | 400 "<campo> no se puede cambiar en una receta emitida."; BD igual | 400 ['patientId no se puede cambiar en una receta emitida.'] | {"data": null, "error": ["patientId no se puede cambiar en una receta emitida."], "statusCode": 400} | **PASS** |
| REC-01-doctorId | MJ-28 PATCH | PATCH receta con doctorId | 400 "<campo> no se puede cambiar en una receta emitida."; BD igual | 400 ['doctorId no se puede cambiar en una receta emitida.'] | {"data": null, "error": ["doctorId no se puede cambiar en una receta emitida."], "statusCode": 400} | **PASS** |
| REC-01-medicalHistoryId | MJ-28 PATCH | PATCH receta con medicalHistoryId | 400 "<campo> no se puede cambiar en una receta emitida."; BD igual | 400 ['medicalHistoryId no se puede cambiar en una receta emitida.'] | {"data": null, "error": ["medicalHistoryId no se puede cambiar en una receta emitida."], "statusCode": 400} | **PASS** |
| REC-02 | MJ-28 | PATCH receta con campo permitido (notes) | 200 y BD | 200 notes=Nota QA editada | {"code": 200, "data": {"id": "2e7c7a3e-bfb8-4905-9eee-177516989c63", "medicalHistoryId": "3c9787ca-1767-47f5-b793-c35b8af89624", "patientId": "93a26b… | **PASS** |
| REC-03 | MJ-28 | rparedes PATCH receta de cmendoza | 403 Solo el médico de la consulta puede modificar esta receta. | 403 Solo el médico de la consulta puede modificar esta receta. | {"data": null, "error": "Solo el médico de la consulta puede modificar esta receta.", "statusCode": 403} | **PASS** |
| REC-03b | MJ-28 | rparedes cancela receta de cmendoza | 403 | 403 Solo el médico de la consulta puede modificar esta receta. | {"data": null, "error": "Solo el médico de la consulta puede modificar esta receta.", "statusCode": 403} | **PASS** |
| REC-03c | MJ-28 | rparedes dispensa receta de cmendoza | 403 | 403 Solo el médico de la consulta puede modificar esta receta. | {"data": null, "error": "Solo el médico de la consulta puede modificar esta receta.", "statusCode": 403} | **PASS** |
| REC-04 | MJ-28 | POST /recipes con paciente distinto al de la historia | 400 patientId y doctorId deben ser los del historial médico indicado. | 400 patientId y doctorId deben ser los del historial médico indicado. | {"data": null, "error": "patientId y doctorId deben ser los del historial médico indicado.", "statusCode": 400} | **PASS** |
| REC-05 | MJ-28 | POST /recipes con doctorId distinto al de la historia | 400 (o 403) | 400 patientId y doctorId deben ser los del historial médico indicado. | {"data": null, "error": "patientId y doctorId deben ser los del historial médico indicado.", "statusCode": 400} | **PASS** |
| REC-06 | MJ-28 | POST /recipes con medicalAppointmentId ajeno a la historia | 400 medicalAppointmentId no corresponde al historial médico indicado. | 400 medicalAppointmentId no corresponde al historial médico indicado. | {"data": null, "error": "medicalAppointmentId no corresponde al historial médico indicado.", "statusCode": 400} | **PASS** |
| REC-07 | MJ-28 | rparedes POST /recipes sobre historia de cmendoza | 403 | 403 Solo el médico de la consulta puede modificar esta receta. | {"data": null, "error": "Solo el médico de la consulta puede modificar esta receta.", "statusCode": 403} | **PASS** |
| REC-08 | MJ-28 | POST /recipes consistente con la historia (cmendoza) | 201; BD con quantity 1 | 201  | {"code": 201, "data": {"id": "0321a565-0c53-444c-94d7-8a94a309d189", "medicalHistoryId": "3c9787ca-1767-47f5-b793-c35b8af89624", "patientId": "93a26b… | **PASS** |
| REC-09 | DTO | POST /recipes sin ítems | 400 | 400 ['Debe incluir al menos un medicamento en la receta'] | {"data": null, "error": ["Debe incluir al menos un medicamento en la receta"], "statusCode": 400} | **PASS** |
| HIST-08 | MJ-41 | Historia borrada no aparece en GET /medical-history/patient/:id | tras DELETE (admin) la historia ya no se lista | medico DELETE=403 admin DELETE=200 deleted=t lista=[] | {"code": 200, "data": []} | **PASS** |
| HIST-09 | MJ-31 HU-06.3 | POST /medical-history sin cita (cmendoza) nace in_progress con requestedExams | 201 in_progress; requested_exams guardado | 201 in_progress \| [{"name": "Rx"}] | {"code": 201, "data": {"id": "d62084fd-1b3b-4b8f-8826-0a3a4f54e2ad", "patientId": "93a26b4d-fc98-4790-b714-37e2b4b440b8", "doctorId": "c5104979-23ae-… | **PASS** |
| HIST-10 | HU-06.3 | PATCH observations en historia in_progress | 200 | 200 | {"code": 200, "data": {"id": "d62084fd-1b3b-4b8f-8826-0a3a4f54e2ad", "patientId": "93a26b4d-fc98-4790-b714-37e2b4b440b8", "doctorId": "c5104979-23ae-… | **PASS** |
| HIST-11-patientId | MJ-27 | PATCH historia in_progress con patientId | 400 | 400 ['patientId no se puede cambiar: la historia queda ligada a su paciente, médico y cita.'] BD pac=True | {"data": null, "error": ["patientId no se puede cambiar: la historia queda ligada a su paciente, médico y cita."], "statusCode": 400} | **PASS** |
| HIST-11-doctorId | MJ-27 | PATCH historia in_progress con doctorId | 400 | 400 ['doctorId no se puede cambiar: la historia queda ligada a su paciente, médico y cita.'] BD pac=True | {"data": null, "error": ["doctorId no se puede cambiar: la historia queda ligada a su paciente, médico y cita."], "statusCode": 400} | **PASS** |
| HIST-11-medicalAppointmentId | MJ-27 | PATCH historia in_progress con medicalAppointmentId | 400 | 400 ['medicalAppointmentId no se puede cambiar: la historia queda ligada a su paciente, médico y cita.'] BD pac=True | {"data": null, "error": ["medicalAppointmentId no se puede cambiar: la historia queda ligada a su paciente, médico y cita."], "statusCode": 400} | **PASS** |
| HIST-12 | MJ-27 | rparedes PATCH historia in_progress de cmendoza | 403 | 403 Solo el médico asignado puede modificar este historial médico. | {"data": null, "error": "Solo el médico asignado puede modificar este historial médico.", "statusCode": 403} | **PASS** |
| MAM-02a | MJ-32 | Subida con patientId distinto al de la cita | 400 patientId no corresponde al paciente de la cita. | 400 patientId no corresponde al paciente de la cita. | {"data": null, "error": "patientId no corresponde al paciente de la cita.", "statusCode": 400} | **PASS** |
| MAM-02b | MJ-32 | Subida con medicalCenterId distinto | 400 medicalCenterId no corresponde al centro de la cita. | 400 medicalCenterId no corresponde al centro de la cita. | {"data": null, "error": "medicalCenterId no corresponde al centro de la cita.", "statusCode": 400} | **PASS** |
| MAM-02c | MJ-32 | Subida con medicalHistoryId de otra cita | 400 medicalHistoryId no corresponde al historial de la cita. | 400 medicalHistoryId no corresponde al historial de la cita. | {"data": null, "error": "medicalHistoryId no corresponde al historial de la cita.", "statusCode": 400} | **PASS** |
| MAM-02d | MJ-32 | Subida con patientId y centro iguales a los de la cita (aceptados) | 201 | 201  | {"code": 201, "data": {"appointmentId": "a68aa136-65db-4e76-876f-fad9da19f3b5", "medicalHistoryId": null, "patientId": "6a36ead9-da95-4814-8e64-13b60… | **PASS** |
| MAM-03a | MJ-32 | cmendoza sube a la cita de qa_doc1 (ajena) | 403 Solo el médico asignado puede adjuntar archivos a esta cita. | 403 Solo el médico asignado puede adjuntar archivos a esta cita. | {"data": null, "error": "Solo el médico asignado puede adjuntar archivos a esta cita.", "statusCode": 403} | **PASS** |
| MAM-03b | MJ-32 | rparedes sube a la cita de cmendoza | 403 | 403 Solo el médico asignado puede adjuntar archivos a esta cita. | {"data": null, "error": "Solo el médico asignado puede adjuntar archivos a esta cita.", "statusCode": 403} | **PASS** |
| MAM-03c | MJ-32 | Subida a cita inexistente | 404 La cita indicada no existe. | 404 La cita indicada no existe. | {"data": null, "error": "La cita indicada no existe.", "statusCode": 404} | **PASS** |
| MAM-03d | MJ-32 | Administrador sube a una cita ajena (qa_doc1) | 201 | 201  | {"code": 201, "data": {"appointmentId": "39cd89e4-c883-4da5-b8b3-41648d6048fc", "medicalHistoryId": null, "patientId": "6fcd030b-63f3-4f63-a95a-eab2b… | **PASS** |
| MAM-04a | MJ-27 b71d517 | rparedes lista archivos de la cita de cmendoza | 403 No tiene acceso a los archivos de esta cita. | 403 No tiene acceso a los archivos de esta cita. | {"data": null, "error": "No tiene acceso a los archivos de esta cita.", "statusCode": 403} | **PASS** |
| MAM-04b |  | cmendoza lista sus archivos | 200 con 2 archivos (MAM-01 y 02d) | 200 n=2 | {"code": 200, "data": [{"id": "603e9921-db64-429f-8456-3dcfb05fb0b7", "appointmentId": "a68aa136-65db-4e76-876f-fad9da19f3b5", "medicalHistoryId": nu… | **PASS** |
| MAM-04c |  | rparedes descarga archivo de cmendoza | 403 | 403 No tiene acceso a los archivos de esta cita. | {"data": null, "error": "No tiene acceso a los archivos de esta cita.", "statusCode": 403} | **PASS** |
| MAM-04d |  | cmendoza descarga su archivo | 200 con imagen | 200 bytes=300 | <class 'bytes'> | **PASS** |
| MAM-04e |  | Listar archivos de cita inexistente | 404 | 404 La cita indicada no existe. | {"data": null, "error": "La cita indicada no existe.", "statusCode": 404} | **PASS** |
| MAM-05a | MJ-33 | Análisis con doctorAgreement inválido | 400 | 400 ['doctorAgreement debe ser accepted, rejected o uncertain.'] | {"data": null, "error": ["doctorAgreement debe ser accepted, rejected o uncertain."], "statusCode": 400} | **PASS** |
| MAM-05b | MJ-32 doc bloque | Análisis con patientId ajeno a la cita | 400 patientId no corresponde al paciente de la cita. | 400 patientId no corresponde al paciente de la cita. | {"data": null, "error": "patientId no corresponde al paciente de la cita.", "statusCode": 400} | **PASS** |
| MAM-05c | MJ-27 | rparedes analiza archivo de cmendoza | 403 | 403 No tiene acceso a este archivo. | {"data": null, "error": "No tiene acceso a este archivo.", "statusCode": 403} | **PASS** |
| MAM-06 | MJ-33 MJ-36 MJ-32 | Análisis server-side: 201, paciente de la cita, label neutral, doctorAgreement guardado | 201; label "Sospechoso de malignidad"/"No sospechoso"; doctor_agreement=accepted | 201 (1.5s) BD=t \| t \| No sospechoso \| accepted \| \| f \| BENIGN \| success resp.label=No sospechoso doctorAgreement=accepted | {"label": "No sospechoso", "db": "t \| t \| No sospechoso \| accepted \| \| f \| BENIGN \| success"} | **PASS** |
| MAM-06b | MJ-36 | Respuesta de análisis sin "BI-RADS" (ni en raw) | texto sin BI-RADS | BI-RADS en respuesta=False | {"code": 201, "data": {"id": "a628b7ff-69cf-4c01-8b15-8a90891e8701", "appointmentId": "a68aa136-65db-4e76-876f-fad9da19f3b5", "appointmentFileId": "6… | **PASS** |
| MAM-07 | MJ-44 | Re-analizar el mismo archivo devuelve el análisis existente (sin nuevo registro) | mismo id; 1 fila viva en BD | 201 id_igual=True filas=1 notes=Comentario QA | {"code": 201, "data": {"id": "a628b7ff-69cf-4c01-8b15-8a90891e8701", "appointmentId": "a68aa136-65db-4e76-876f-fad9da19f3b5", "appointmentFileId": "6… | **PASS** |
| MAM-08 | MJ-32 | Análisis de un archivo cuyo paciente difiere del de la cita (forzado por SQL) | 409 El archivo no corresponde al paciente de la cita; no se puede analizar. | 409 El archivo no corresponde al paciente de la cita; no se puede analizar. | {"data": null, "error": "El archivo no corresponde al paciente de la cita; no se puede analizar.", "statusCode": 409} | **PASS** |
| MAM-09 | MJ-35 MJ-36 | Bandeja agrupada (cmendoza) con ?date de la cita contiene el análisis y no usa BI-RADS | 200; incluye id; sin BI-RADS (nota: sin parámetro filtra por hoy, es contrato HU-09.3) | 200 incluye_id=True biRads=False | {"code": 200, "data": [{"appointmentId": "a68aa136-65db-4e76-876f-fad9da19f3b5", "appointment": {"id": "a68aa136-65db-4e76-876f-fad9da19f3b5", "appoi… | **PASS** |
| MAM-09b | MJ-27 | Bandeja de rparedes no contiene el análisis de cmendoza | no incluye id | 200 incluye=False |  | **PASS** |
| MAM-09c | alcance | rparedes GET análisis de cmendoza | 403 | 403 No tiene acceso a este análisis. | {"data": null, "error": "No tiene acceso a este análisis.", "statusCode": 403} | **PASS** |
| MAM-09d | alcance | rparedes GET imagen del análisis de cmendoza | 403 | 403 | {'data': None, 'error': 'No tiene acceso a este análisis.', 'statusCode': 403} | **PASS** |
| MAM-10a | MJ-33 | Revisión con reviewAgreement inválido | 400 | 400 ['reviewAgreement debe ser accepted, rejected o uncertain.'] | {"data": null, "error": ["reviewAgreement debe ser accepted, rejected o uncertain."], "statusCode": 400} | **PASS** |
| MAM-10b | MJ-27 | rparedes revisa el análisis de cmendoza | 403 | 403 No tiene acceso a este análisis. | {"data": null, "error": "No tiene acceso a este análisis.", "statusCode": 403} | **PASS** |
| MAM-10c | MJ-34 | cmendoza revisa desde la bandeja | 200; BD is_reviewed=t, review_agreement=accepted | 200 BD=t \| accepted \| Coincide \| t | {"code": 200, "data": {"id": "a628b7ff-69cf-4c01-8b15-8a90891e8701", "appointmentId": "a68aa136-65db-4e76-876f-fad9da19f3b5", "appointmentFileId": "6… | **PASS** |
| MAM-10d | MJ-34 | Segunda revisión | 409 El análisis ya fue revisado; la revisión no se sobrescribe.; BD intacta | 409 El análisis ya fue revisado; la revisión no se sobrescribe. BD=accepted \| Coincide | {"data": null, "error": "El análisis ya fue revisado; la revisión no se sobrescribe.", "statusCode": 409} | **PASS** |
| MAM-11a | MJ-37 | Eliminar un análisis revisado | 409 Un análisis revisado no se puede eliminar. | 409 Un análisis revisado no se puede eliminar. | {"data": null, "error": "Un análisis revisado no se puede eliminar.", "statusCode": 409} | **PASS** |
| MAM-12a | MJ-32 | qa_doc1 analiza archivo (subido por admin a su cita) | 201 | 201  | {"code": 201, "data": {"id": "60d7a45b-d1e3-4a81-801f-0579234fe005", "appointmentId": "39cd89e4-c883-4da5-b8b3-41648d6048fc", "appointmentFileId": "e… | **PASS** |
| MAM-12b | MJ-37 | DELETE sin cuerpo/motivo | 400 | 400 ['reason must be shorter than or equal to 500 characters', 'El motivo es requerido.', 'reason must be a string'] | {"data": null, "error": ["reason must be shorter than or equal to 500 characters", "El motivo es requerido.", "reason must be a string"], "statusCode… | **PASS** |
| MAM-12c | MJ-37 | DELETE con motivo solo espacios | 400 El motivo es requerido. | 400 ['El motivo es requerido.'] vivo=t | {"data": null, "error": ["El motivo es requerido."], "statusCode": 400} | **PASS** |
| MAM-12d | MJ-37 | cmendoza elimina el análisis de qa_doc1 (ajeno) | 403 | 403 No tiene acceso a este análisis. | {"data": null, "error": "No tiene acceso a este análisis.", "statusCode": 403} | **PASS** |
| MAM-01 | MJ-32 | Subida con solo appointmentId: paciente e historia derivados de la cita | 201; BD patient_id = el de la cita; medical_history_id = el de la cita (o nulo si no hay) | 201 BD=t \| t \| 3e6d7175-75a9-4e8b-b973-f5c41f3a362a | t \| t \| 3e6d7175-75a9-4e8b-b973-f5c41f3a362a | **PASS** |
| MAM-09e | MJ-33 | recent?date=…&isReviewed=true incluye análisis revisado con reviewAgreement y label neutra | incluye id, reviewAgreement=accepted | 200 incluye=True agreement=True | {"code": 200, "data": [{"id": "a628b7ff-69cf-4c01-8b15-8a90891e8701", "appointmentId": "a68aa136-65db-4e76-876f-fad9da19f3b5", "appointmentFileId": "… | **PASS** |
| MAM-12e | MJ-37 | Eliminar con motivo válido con espacios (ejecutado en la corrida previa): BD | deleted_at, deletion_reason recortado, deleted_by | t \| Se analizó la imagen de otro estudio \| t | respuesta DELETE 204 observada en la corrida | **PASS** |
| MAM-12f | MJ-37 | GET del análisis eliminado | 404 | 404 Análisis no encontrado. | {"data": null, "error": "Análisis no encontrado.", "statusCode": 404} | **PASS** |
| MAM-12g | MJ-44 | Re-analizar el archivo tras eliminar el análisis (nuevo registro) | 201 con id distinto | 201 nuevo=True | {"code": 201, "data": {"id": "c105f80b-b40d-45bd-bd88-809d6fd73720", "appointmentId": "39cd89e4-c883-4da5-b8b3-41648d6048fc", "appointmentFileId": "e… | **PASS** |
| MAM-13 | MJ-36 | SQL: ninguna etiqueta almacenada (ni raw_response) menciona BI-RADS | 0 filas | 24 de 98; etiquetas='No sospechoso:75\r\nSospechoso de malignidad:22' |  | **FAIL** |
| MAM-13b | MJ-36 | API: GET análisis legacy (junio) y recent de junio no devuelven "BI-RADS" | sin BI-RADS en la respuesta | GET /mammography-analyses/08127e07… y recent de junio devuelven rawResponse.raw.label="Neoplasia Maligna (BI-RADS 4/5)" (22 filas vivas legacy) | {"code": 200, "data": [{"id": "538c15d1-2c2a-4cc6-8b02-36fc776e536e", "appointmentId": "f3f37b77-b10a-4095-8956-1d4db219afac", "appointmentFileId": "… | **FAIL** |
| USR-01 | MJ-11 MJ-46 | POST /users con contraseña de 7 caracteres | 400 La contraseña debe tener al menos 8 caracteres; no se crea usuario | 400 ['La contraseña debe tener al menos 8 caracteres'] users_creados=0 | {"data": null, "error": ["La contraseña debe tener al menos 8 caracteres"], "statusCode": 400} | **PASS** |
| USR-02 | MJ-11 | POST /users con contraseña de exactamente 8 caracteres (enfermero qa_ok8) | 201 y puede iniciar sesión | 201  | {"code": 201, "data": {"name": "qa_ok8", "email": "qa_ok8@qa.example.com", "status": true, "roleId": "c6dcc63d-bc87-46db-b60b-5c1d3221b8f4", "firstLo… | **PASS** |
| USR-03 | MJ-11 | POST /users-security con 7 caracteres | 400 mínimo 8 | 400 ['La contraseña debe tener al menos 8 caracteres', 'personalPhone must be longer than or equal to 7 characters', 'personalPhone must be a string', 'houseAddress must be shorter than or equal to 255 characters', 'houseAddress should not be empty', 'houseAd… | {"data": null, "error": ["La contraseña debe tener al menos 8 caracteres", "personalPhone must be longer than or equal to 7 characters", "personalPho… | **PASS** |
| AUTH-01-cmendoza | MJ-06 CA | /auth/me de cmendoza: isAdmin=False, mustChangePassword=false | isAdmin=False | 200 isAdmin=False mustChangePassword=False | {"id": "00709eb2-63a2-4168-ad25-2eec990476e8", "name": "cmendoza", "email": "cmendoza@medos-demo.example.com", "doctorId": "c5104979-23ae-45a7-aeb1-1… | **PASS** |
| AUTH-01-enf.ramirez | MJ-06 CA | /auth/me de enf.ramirez: isAdmin=False, mustChangePassword=false | isAdmin=False | 200 isAdmin=False mustChangePassword=False | {"id": "20c19e72-8b98-4d35-ac48-7ec2449db961", "name": "enf.ramirez", "email": "enframirez@medos-demo.example.com", "doctorId": null, "isAdmin": fals… | **PASS** |
| AUTH-01-admin.caracas | MJ-06 CA | /auth/me de admin.caracas: isAdmin=True, mustChangePassword=false | isAdmin=True | 200 isAdmin=True mustChangePassword=False | {"id": "0d47fb45-9753-44b7-b1a6-06a73f803d27", "name": "admin.caracas", "email": "admincaracas@medos-demo.example.com", "doctorId": null, "isAdmin": … | **PASS** |
| AUTH-01-admin.regional | MJ-06 CA | /auth/me de admin.regional: isAdmin=True, mustChangePassword=false | isAdmin=True | 200 isAdmin=True mustChangePassword=False | {"id": "7d60bba0-0863-4514-8f9d-23506b7d6f78", "name": "admin.regional", "email": "adminregional@medos-demo.example.com", "doctorId": null, "isAdmin"… | **PASS** |
| AUTH-02 | MJ-01 | 5 fallos de la misma credencial; luego login CORRECTO | 6º intento (con clave correcta) → 429 "Demasiados intentos fallidos. La cuenta quedó bloqueada 15 minutos." | fallos=[401, 401, 401, 401, 401]; correcto→429 Demasiados intentos fallidos. La cuenta quedó bloqueada 15 minutos. | {"data": null, "error": "Demasiados intentos fallidos. La cuenta quedó bloqueada 15 minutos.", "statusCode": 429} | **PASS** |
| AUTH-02b | MJ-01 | Los 5 intentos fallidos devuelven 401 (o 429 el último) | 401 x4 y 401/429 | [401, 401, 401, 401, 401] | [401, 401, 401, 401, 401] | **PASS** |
| AUTH-03 | MJ-01 | Credencial inexistente: mismos 5 fallos → 429 con el mismo mensaje (no revela cuentas) | 429 igual que cuenta real | fallos=[401, 401, 401, 401, 401]; →429 Demasiados intentos fallidos. La cuenta quedó bloqueada 15 minutos. | {"data": null, "error": "Demasiados intentos fallidos. La cuenta quedó bloqueada 15 minutos.", "statusCode": 429} | **PASS** |
| AUTH-04 | MJ-01 (reinicio) | 4 fallos + login correcto + 4 fallos: el contador se reinició (no bloquea) | ambos logins correctos 201 | ok1=201 fallos2=[401, 401, 401, 401] ok2=201 |  | **PASS** |
| AUD-01 | MJ-39 MJ-01 | access-log?action=login_failed registra los intentos: userId null, resourceId=credencial, statusCode 401/429, sin contraseña | filas de qa_lock/qa_fantasma/qa_lock2 con userId null y 401/429; ninguna contiene la contraseña | 200 filas_qa=22 codes=[401, 429] userId_null=True con_password=0 | [{"id": "b04037d2-e2b7-47d3-867c-0e76bc0fe6bd", "createdAt": "2026-10-04T23:35:47.345Z", "userId": null, "method": "POST", "path": "/auth/login", "re… | **PASS** |
| AUD-01b | MJ-39 | BD auditoria.access_log: filas login_failed de las 3 credenciales QA | >= 13 (5+1 +5+1 +4+4 intentos) | 22 | 22 | **PASS** |
| AUD-02 | MJ-39 | access-log con médico (sin logs.consultar) | 403 | 403 No tienes permisos. Se requiere uno de: logs.consultar | {"data": null, "error": "No tienes permisos. Se requiere uno de: logs.consultar", "statusCode": 403} | **PASS** |
| AUD-03 | MJ-39 | access-log con enfermero | 403 | 403 No tienes permisos. Se requiere uno de: logs.consultar | {"data": null, "error": "No tienes permisos. Se requiere uno de: logs.consultar", "statusCode": 403} | **PASS** |
| AUD-04 | MJ-39 | access-log sin token | 401 | 401 | {"data": null, "error": "Token requerido para esta petición", "statusCode": 401} | **PASS** |
| AUD-05 | MJ-39 | access-log limit=101 (tope 100) | 400 | 400 ['limit must not be greater than 100'] | {"data": null, "error": ["limit must not be greater than 100"], "statusCode": 400} | **PASS** |
| AUD-06 | MJ-39 | access-log action inválida | 400 | 400 ['action must be one of the following values: read, write, login_failed'] | {"data": null, "error": ["action must be one of the following values: read, write, login_failed"], "statusCode": 400} | **PASS** |
| AUD-07 | MJ-39 | access-log action=write: solo filas write; sin cuerpo ni query en path | 200; todas write; path sin "?" | 200 {'write'} qs=False | [{"id": "4685d4da-9f2e-4003-8756-73b238b32acd", "createdAt": "2026-10-04T23:33:32.130Z", "userId": "2963b3c4-d449-49f4-b5af-d2061af8e08d", "method": … | **PASS** |
| USR-02b | MJ-11 | Login del usuario de 8 caracteres | 201 con access_token | 201 | {"access_token": "eyJhbGciOiJIUzI1NiIs", "refresh_token": "eyJhbGciOiJIUzI1NiIs"} | **PASS** |
| AUTH-05 | MJ-01 | Cuenta bloqueada sigue bloqueada con clave correcta (ventana de 15 min) | 429 | 429 Demasiados intentos fallidos. La cuenta quedó bloqueada 15 minutos. | {"data": null, "error": "Demasiados intentos fallidos. La cuenta quedó bloqueada 15 minutos.", "statusCode": 429} | **PASS** |
| AUD-08 | MJ-39 | Menú logs: "Bitácora de accesos", /audit/access-log, visible (BD) | Bitácora de accesos \| /audit/access-log \| true | Bitácora de accesos \| /audit/access-log \| true | Bitácora de accesos \| /audit/access-log \| true | **PASS** |
| MENU-01 | MJ-10 | Menús IA visibles: "Bandeja de análisis IA" y "Detector IA" con su url (BD) | visibles con nombre y url nuevos | machine-learning=Detector IA /machine-learning/cancer-detector true ; mammography-analysis=Bandeja de análisis IA /machine-learning/review-inbox true | machine-learning=Detector IA /machine-learning/cancer-detector true | **PASS** |
| MENU-02 | MJ-10 MJ-39 | GET /menu?limit=100 (admin) incluye las 3 entradas; solo un menú se llama "Citas Médicas" | 3 entradas visibles; un solo "Citas Médicas" (appointments) | 200; menús con ese nombre: 1 |  | **PASS** |
| USR-10-list-cmen | MJ-04 | cmendoza (medico) GET /users | 403 | 403 No tienes permisos. Se requiere uno de: user.consultar | {"data": null, "error": "No tienes permisos. Se requiere uno de: user.consultar", "statusCode": 403} | **PASS** |
| USR-10-get-cmen | MJ-04 | cmendoza (medico) GET /users/:id | 403 | 403 No tienes permisos. Se requiere uno de: user.consultar | {"data": null, "error": "No tienes permisos. Se requiere uno de: user.consultar", "statusCode": 403} | **PASS** |
| USR-10-patch-cmen | MJ-04 | cmendoza (medico) PATCH /users/:id | 403; email intacto | 403 No tienes permisos. Se requiere uno de: user.actualizar email=qa_reset@qa.example.com | {"data": null, "error": "No tienes permisos. Se requiere uno de: user.actualizar", "statusCode": 403} | **PASS** |
| USR-10-list-enf. | MJ-04 | enf.ramirez (enfermero) GET /users | 403 | 403 No tienes permisos. Se requiere uno de: user.consultar | {"data": null, "error": "No tienes permisos. Se requiere uno de: user.consultar", "statusCode": 403} | **PASS** |
| USR-10-get-enf. | MJ-04 | enf.ramirez (enfermero) GET /users/:id | 403 | 403 No tienes permisos. Se requiere uno de: user.consultar | {"data": null, "error": "No tienes permisos. Se requiere uno de: user.consultar", "statusCode": 403} | **PASS** |
| USR-10-patch-enf. | MJ-04 | enf.ramirez (enfermero) PATCH /users/:id | 403; email intacto | 403 No tienes permisos. Se requiere uno de: user.actualizar email=qa_reset@qa.example.com | {"data": null, "error": "No tienes permisos. Se requiere uno de: user.actualizar", "statusCode": 403} | **PASS** |
| USR-10-admin | MJ-04 | admin GET /users | 200 | 200 |  | **PASS** |
| USR-11-pre | MJ-05 | qa_reset inicia sesión (previo al reset) | /auth/me 200 | 200 |  | **PASS** |
| USR-11-medicoico | MJ-05 | reset-password: medico | 403 | 403 No tienes permisos. Se requiere uno de: user.actualizar | {"data": null, "error": "No tienes permisos. Se requiere uno de: user.actualizar", "statusCode": 403} | **PASS** |
| USR-11-enfermeroero | MJ-05 | reset-password: enfermero | 403 | 403 No tienes permisos. Se requiere uno de: user.actualizar | {"data": null, "error": "No tienes permisos. Se requiere uno de: user.actualizar", "statusCode": 403} | **PASS** |
| USR-11-adminres | MJ-05 | reset-password: admin con 7 caracteres | 400 | 400 ['La contraseña temporal debe tener al menos 8 caracteres'] | {"data": null, "error": ["La contraseña temporal debe tener al menos 8 caracteres"], "statusCode": 400} | **PASS** |
| USR-11-adminsmo | MJ-05 | reset-password: admin sobre sí mismo | 400 | 400 Para cambiar su propia contraseña use PATCH /auth/change-password. | {"data": null, "error": "Para cambiar su propia contraseña use PATCH /auth/change-password.", "statusCode": 400} | **PASS** |
| USR-11-404 | MJ-05 | reset-password de usuario inexistente | 404 | 404 Usuario con ID 11111111-1111-4111-8111-111111111111 no encontrado. | {"data": null, "error": "Usuario con ID 11111111-1111-4111-8111-111111111111 no encontrado.", "statusCode": 404} | **PASS** |
| USR-12 | MJ-05 | Admin restablece la contraseña de qa_reset | 200 con mensaje; BD first_login=true | 200 {'message': 'Contraseña restablecida. El usuario deberá cambiarla al iniciar sesión.'} first_login(public)=t (seguridad)='' | {"code": 200, "data": {"message": "Contraseña restablecida. El usuario deberá cambiarla al iniciar sesión."}} | **PASS** |
| USR-12b | MJ-05 | La sesión previa queda revocada tras el reset | 401 | 401 | {"data": null, "error": "Sesión expirada o cerrada", "statusCode": 401} | **PASS** |
| USR-12c | MJ-05 | Login con la clave anterior | 401 | 401 | {"data": null, "error": "Credenciales inválidas", "statusCode": 401} | **PASS** |
| USR-12d | MJ-05 MJ-01 | Login con la temporal: /auth/me mustChangePassword=true | true | 200 mustChangePassword=True | {"id": "c5e3fa91-48f0-436a-a04a-ee82745edf40", "name": "qa_reset", "email": "qa_reset@qa.example.com", "doctorId": null, "isAdmin": false, "mustChang… | **PASS** |
| USR-13a | MJ-46 | change-password con nueva de 7 caracteres | 400 mínimo 8 | 400 ['La nueva contraseña debe tener al menos 8 caracteres'] | {"data": null, "error": ["La nueva contraseña debe tener al menos 8 caracteres"], "statusCode": 400} | **PASS** |
| USR-13b | 11.2 | change-password con actual incorrecta | 400/401 | 400 La contraseña actual es incorrecta | {"data": null, "error": "La contraseña actual es incorrecta", "statusCode": 400} | **PASS** |
| USR-13c | MJ-05 MJ-46 | change-password válido: BD first_login=false | 200; first_login=false | 200 first_login=f | {"code": 200, "data": {"message": "Contraseña actualizada correctamente"}} | **PASS** |
| USR-13d | MJ-05 | Login con la nueva: mustChangePassword=false | false | 200 False | {"id": "c5e3fa91-48f0-436a-a04a-ee82745edf40", "name": "qa_reset", "email": "qa_reset@qa.example.com", "doctorId": null, "isAdmin": false, "mustChang… | **PASS** |
| USR-14 | MJ-05 | Alta con firstLogin=true: /auth/me mustChangePassword=true | true | 201 / 200 True | {"id": "b1d9aa9b-6b01-4e11-96bc-e925078456f9", "name": "qa_first", "email": "qa_first@qa.example.com", "doctorId": null, "isAdmin": false, "mustChang… | **PASS** |
| FOTO-01 | MJ-46 | Enfermero (sin file.crear) sube su foto de perfil (solo sesión) | 201 con url | 201 http://localhost:8008/files/profile-photos/c5e3fa91-48f0-436a-a04a-ee82745edf40/1791157089773-kmnya0.webp | {"code": 201, "data": {"url": "http://localhost:8008/files/profile-photos/c5e3fa91-48f0-436a-a04a-ee82745edf40/1791157089773-kmnya0.webp"}} | **PASS** |
| FOTO-02 | MJ-43 | Enfermero sube foto con ownerId de otro usuario (cmendoza) | 403 | 403 No puede cambiar la foto de otra persona. | {"data": null, "error": "No puede cambiar la foto de otra persona.", "statusCode": 403} | **PASS** |
| FOTO-03 | MJ-43 | Administrador sube foto a nombre de otro (qa_reset) | 201 | 201  | {"code": 201, "data": {"url": "http://localhost:8008/files/profile-photos/c5e3fa91-48f0-436a-a04a-ee82745edf40/1791157091438-7sxa0c.webp"}} | **PASS** |
| FOTO-04 | MJ-04 MJ-46 | /auth/profile.imageUrl devuelve la foto efectiva tras subir + PATCH /auth/me | imageUrl = url subida (no null) | PATCH=200 profile=200 imageUrl=http://localhost:8008/files/profile-photos/c5e3fa91-48f0-436a-a04a-ee82745edf40/1791157089773-kmnya0.webp url=http://localhost:8008/files/profile-photos/c5e3fa91-48f0-436a-a04a-ee82745edf40/1791157089773-kmnya0.webp | {"imageUrl": "http://localhost:8008/files/profile-photos/c5e3fa91-48f0-436a-a04a-ee82745edf40/1791157089773-kmnya0.webp", "photoUrl": "http://localho… | **PASS** |
| FOTO-05 | MJ-46 MJ-43 | cmendoza (medico) ve la foto de perfil de otro usuario | 403 No tiene acceso a esta foto. | 403 No tiene acceso a esta foto. | {"data": null, "error": "No tiene acceso a esta foto.", "statusCode": 403} | **PASS** |
| FOTO-06 | MJ-46 | El dueño ve su propia foto | 200 | 200 | <class 'bytes'> | **PASS** |
| FOTO-07 | MJ-43 | Administrador ve la foto ajena | 200 | 200 | <class 'bytes'> | **PASS** |
| FOTO-08 | AUTH | Sin token | 401 | 401 | {"data": null, "error": "Token requerido para esta petición", "statusCode": 401} | **PASS** |
| DOC-02 | MJ-16 CA-05 | cmendoza DELETE /doctors/<su propio id> | 403; sigue viva | 403 No tienes permisos. Se requiere uno de: doctors.eliminar | {"data": null, "error": "No tienes permisos. Se requiere uno de: doctors.eliminar", "statusCode": 403} | **PASS** |
| DOC-03b | CA-09 | cmendoza PATCH su perfil reenviando isActive=true (valor actual) | 200 | 200  | {"code": 200, "data": {"id": "c5104979-23ae-45a7-aeb1-199baa3c48f8", "commonPersonId": "9ef4a7bd-253f-42c1-b3ec-201fab6be9cb", "licenseNumber": "MPPS… | **PASS** |
| DOC-04a | MJ-17 CA-06 | cmendoza se agrega Los Próceres (medicalCenterIds [Ávila, Próceres]) | 403 Solo un administrador puede cambiar los centros…; sigue solo en Ávila | 403 Solo un administrador puede cambiar los centros médicos de un médico. centros=1 | {"data": null, "error": "Solo un administrador puede cambiar los centros médicos de un médico.", "statusCode": 403} | **PASS** |
| DOC-04b | MJ-17 CA-06 | cmendoza reenvía el mismo conjunto [Ávila] | 200 | 200  | {"code": 200, "data": {"id": "c5104979-23ae-45a7-aeb1-199baa3c48f8", "commonPersonId": "9ef4a7bd-253f-42c1-b3ec-201fab6be9cb", "licenseNumber": "MPPS… | **PASS** |
| DOC-05 | CA-04 | cmendoza PATCH perfil de rparedes | 403 No tiene acceso a este perfil de doctor. | 403 No tiene acceso a este perfil de doctor. | {"data": null, "error": "No tiene acceso a este perfil de doctor.", "statusCode": 403} | **PASS** |
| DOC-06 | 46512e8 | cmendoza POST /doctors | 403 (sin doctors.crear) | 403 No tienes permisos. Se requiere uno de: doctors.crear | {"data": null, "error": "No tienes permisos. Se requiere uno de: doctors.crear", "statusCode": 403} | **PASS** |
| DOC-07 | CA-03 | cmendoza GET /doctors: solo su registro | 1 registro (el suyo) | 200 n=1 | ["c5104979-23ae-45a7-aeb1-199baa3c48f8"] | **PASS** |
| DOC-07b | RN-06 | cmendoza GET /doctors/<rparedes> | 403 | 403 | {"data": null, "error": "No tiene acceso a este perfil de doctor.", "statusCode": 403} | **PASS** |
| DOC-08a | MJ-13 CA-08 | admin PATCH médico con specialtyIds inexistente | 400 Especialidades inexistentes: <ids>.; conjunto intacto | 400 Especialidades inexistentes: 22222222-2222-4222-8222-222222222222. esp=1 (antes 1) | {"data": null, "error": "Especialidades inexistentes: 22222222-2222-4222-8222-222222222222.", "statusCode": 400} | **PASS** |
| DOC-08b | MJ-13 CA-08 | admin PATCH médico con medicalCenterIds inexistente | 400 Centros médicos inexistentes: <ids>.; centros intactos | 400 Centros médicos inexistentes: 22222222-2222-4222-8222-222222222222. centros=1 | {"data": null, "error": "Centros médicos inexistentes: 22222222-2222-4222-8222-222222222222.", "statusCode": 400} | **PASS** |
| DOC-09-birthDat | MJ-23 CA-11 | PATCH médico commonPerson birthDate formato inválido | 400 | 400 ['commonPerson.La fecha de nacimiento debe tener el formato YYYY-MM-DD'] | {"data": null, "error": ["commonPerson.La fecha de nacimiento debe tener el formato YYYY-MM-DD"], "statusCode": 400} | **PASS** |
| DOC-09-sex X | MJ-23 CA-11 | PATCH médico commonPerson sex X | 400 | 400 ['commonPerson.El sexo debe ser F o M'] | {"data": null, "error": ["commonPerson.El sexo debe ser F o M"], "statusCode": 400} | **PASS** |
| DOC-09-ok | MJ-23 | PATCH médico con birthDate 1980-05-17 y sex F | 200; BD fecha_nacimiento=1980-05-17, sexo=F | 200 BD=1980-05-17 \| F | {"code": 200, "data": {"id": "b617e1ab-4bf7-449f-bda5-d0d87ac0bea2", "commonPersonId": "44d30476-c1bc-4c7a-83d4-6b2d4400fca1", "licenseNumber": "QA-L… | **PASS** |
| DOC-10 | MJ-15 CA-07 | Admin quita Próceres a qa_doc1 (sin citas allí): bloque de Próceres eliminado | 200; bloques en Próceres 1→0; vínculo quitado | 200 bloques 1→0 vínculo=0 | {"code": 200, "data": {"id": "4c80b7fc-6a73-41c3-9929-b4abb8df4ea0", "commonPersonId": "2a5f47b8-bc74-432c-97cb-0030318c6aae", "licenseNumber": "QA-L… | **PASS** |
| DOC-11 | MJ-15 | Retirar a qa_doc1 de Ávila con citas abiertas allí | 409 …tiene N cita(s) pendiente(s) o en curso; nada cambia | 409 No se puede retirar al médico del centro: tiene 5 cita(s) pendiente(s) o en curso. Cancélelas o reprográmelas primero. vínculo=1 bloques=2 | {"data": null, "error": "No se puede retirar al médico del centro: tiene 5 cita(s) pendiente(s) o en curso. Cancélelas o reprográmelas primero.", "st… | **PASS** |
| DOC-11b | MJ-15 | Vía PATCH /doctors: quitar el único centro con citas abiertas | 409; centro intacto | 409 No se puede retirar al médico del centro: tiene 5 cita(s) pendiente(s) o en curso. Cancélelas o reprográmelas primero. vínculo=1 | {"data": null, "error": "No se puede retirar al médico del centro: tiene 5 cita(s) pendiente(s) o en curso. Cancélelas o reprográmelas primero.", "st… | **PASS** |
| DOC-12a | MJ-43 CA-10 | cmendoza sube foto con doctorId de rparedes | 403 No puede cambiar la foto de otra persona. | 403 No puede cambiar la foto de otra persona. | {"data": null, "error": "No puede cambiar la foto de otra persona.", "statusCode": 403} | **PASS** |
| DOC-12b | CA-10 | cmendoza sube su propia foto | 201 con url | 201  | {"code": 201, "data": {"url": "http://localhost:8008/files/doctor-images/21b2ca60-f93f-4269-8131-b3672c44f656", "image": {"doctorId": "c5104979-23ae-… | **PASS** |
| ROLE-01 | MJ-07 | Crear y eliminar rol: borrado LÓGICO (fila sigue, deleted_at) | DELETE 200; BD deleted_at no nulo | create=201 delete=200 fila_con_deleted_at=t | {"code": 200} | **PASS** |
| ROLE-02 | MJ-07 | El nombre queda libre tras el borrado lógico (re-crear) | 201 | 201  | {"code": 201, "data": {"name": "qa_rol_tmp", "userId": "0d47fb45-9753-44b7-b1a6-06a73f803d27", "updatedAt": null, "deletedAt": null, "id": "fa525cfa-… | **PASS** |
| ROLE-03 | MJ-07 | Eliminar rol con un usuario vivo | 409 El rol … tiene 1 usuario(s) asignado(s) | create_user=201 delete=409 El rol 'qa_rol_tmp' tiene 1 usuario(s) asignado(s); reasígnelos antes de eliminarlo. vivo=t | {"data": null, "error": "El rol 'qa_rol_tmp' tiene 1 usuario(s) asignado(s); reasígnelos antes de eliminarlo.", "statusCode": 409} | **PASS** |
| ROLE-04-superusuario | MJ-07 | Eliminar rol superusuario | 400 | 400 El rol 'superusuario' no se puede eliminar: dejaría el sistema sin administradores. | {"data": null, "error": "El rol 'superusuario' no se puede eliminar: dejaría el sistema sin administradores.", "statusCode": 400} | **PASS** |
| ROLE-04-medico | MJ-07 | Eliminar rol medico | 400 | 400 El rol 'medico' es del sistema y no se puede eliminar. | {"data": null, "error": "El rol 'medico' es del sistema y no se puede eliminar.", "statusCode": 400} | **PASS** |
| ROLE-05 | MJ-08 | GET /permissions/role/:roleId (enfermero) | 200 con [{module,action,permissionId,menuId,isActive}] | 200 n=3 muestra={'module': 'parameters', 'action': 'consultar', 'permissionId': 'd5d6de53-0734-44e5-ae49-d9057aecab23', 'menuId': '08d3d483-89e1-4ed3-9359-630733d3d81b', 'isActive': True} | [{"module": "parameters", "action": "consultar", "permissionId": "d5d6de53-0734-44e5-ae49-d9057aecab23", "menuId": "08d3d483-89e1-4ed3-9359-630733d3d… | **PASS** |
| ROLE-06 | MJ-08 | GET /permissions/role/<inexistente> | 404 | 404 Rol con ID 22222222-2222-4222-8222-222222222222 no encontrado | {"data": null, "error": "Rol con ID 22222222-2222-4222-8222-222222222222 no encontrado", "statusCode": 404} | **PASS** |
| ROLE-07 | MJ-08 | GET /permissions/role/<rol borrado> | 404 | 404 Rol con ID f0f28258-d029-4add-86f0-32eabf7792bf no encontrado | {"data": null, "error": "Rol con ID f0f28258-d029-4add-86f0-32eabf7792bf no encontrado", "statusCode": 404} | **PASS** |
| ROLE-08 | permisos | medico GET /permissions/role/:id | 403 | 403 No tienes permisos. Se requiere uno de: permission.consultar | {"data": null, "error": "No tienes permisos. Se requiere uno de: permission.consultar", "statusCode": 403} | **PASS** |
| DOC-01 | MJ-16 CA-05 | cmendoza (medico) DELETE /doctors/<rparedes> | 403; rparedes sigue activo y sin deleted_at | 403 No tienes permisos. Se requiere uno de: doctors.eliminar; BD rparedes isActive=t deleted_at=null |  | **PASS** |
| DOC-03a | MJ-16 CA-09 | cmendoza PATCH su perfil con isActive=false | 403 Solo un administrador puede activar o desactivar un médico.; sigue activa | 403 Solo un administrador puede activar o desactivar un médico.; BD cmendoza isActive=t |  | **PASS** |
| PAT-01 | MJ-23 MJ-48 | Enfermero (qa_nurse) registra paciente con birthDate, sex y maritalStatus válidos | 201; BD fecha_nacimiento, sexo, estado civil; createdBy = enfermero | 201 BD=1985-03-20 \| F \| casado \| t | {"code": 201, "data": {"id": "9e8f1d2c-f237-4037-b74a-b0f8bdfe8056", "commonPersonId": "6930736b-3be7-4baa-88a4-a74dbed54b01", "patientCode": "PAC-20… | **PASS** |
| PAT-02-maritalStatusre | MJ-23 MJ-48 | POST /patient con maritalStatus libre | 400; no se crea persona | 400 ['El estado civil debe ser uno de: soltero, casado, divorciado, viudo, union_libre'] persona=0 | {"data": null, "error": ["El estado civil debe ser uno de: soltero, casado, divorciado, viudo, union_libre"], "statusCode": 400} | **PASS** |
| PAT-02-birthDatera | MJ-23 MJ-48 | POST /patient con birthDate futura | 400; no se crea persona | 400 ['commonPerson.La fecha de nacimiento no puede ser futura'] persona=0 | {"data": null, "error": ["commonPerson.La fecha de nacimiento no puede ser futura"], "statusCode": 400} | **PASS** |
| PAT-02-sex X | MJ-23 MJ-48 | POST /patient con sex X | 400; no se crea persona | 400 ['commonPerson.El sexo debe ser F o M'] persona=0 | {"data": null, "error": ["commonPerson.El sexo debe ser F o M"], "statusCode": 400} | **PASS** |
| PAT-02-sex f | MJ-23 MJ-48 | POST /patient con sex minúscula f | 400; no se crea persona | 400 ['commonPerson.El sexo debe ser F o M'] persona=0 | {"data": null, "error": ["commonPerson.El sexo debe ser F o M"], "statusCode": 400} | **PASS** |
| PAT-03 | MJ-46 (nurse photo) | Enfermero (sin file.crear) sube la foto del paciente que registró (POST /files/common-person-image, el endpoint que usa el formulario) | 201 con url; fila en common_person_images | 201 url=http://localhost:8008/files/common-person-images/f6d61394-cf2d-4034-a36a-29035350af6c filas_en_BD=1; GET paciente imageUrl/photoUrl=None/None | {"code": 201, "data": {"url": "http://localhost:8008/files/common-person-images/f6d61394-cf2d-4034-a36a-29035350af6c"}} | **PASS** |
| PAT-03c | MJ-43 | qa_nurse2 (otro centro) sube foto a la persona del paciente de qa_nurse (common-person-image) | 403 | 403 No tiene acceso a este paciente. | {"data": null, "error": "No tiene acceso a este paciente.", "statusCode": 403} | **PASS** |
| PAT-03d | MJ-46 | GET /patient/:id del paciente con foto subida por enfermero devuelve imageUrl | imageUrl no nulo | imageUrl=http://localhost:8008/files/common-person-images/f6d61394-… (en detalle y en listado) | patient.imageUrl presente; commonPerson.photoUrl null (la foto vive en common_person_images) | **PASS** |
| PAT-04a | MJ-02 MJ-21 | qa_nurse lee el paciente que registró | 200 | 200 |  | **PASS** |
| PAT-04b | MJ-02 MJ-21 | qa_nurse2 (Próceres, sin citas) lee paciente ajeno | 403 No tiene acceso a este paciente. | 403 No tiene acceso a este paciente. | {"data": null, "error": "No tiene acceso a este paciente.", "statusCode": 403} | **PASS** |
| PAT-04c | MJ-21 | qa_nurse2 edita paciente ajeno | 403; BD sin cambio | 403 No tienes permisos. Se requiere uno de: patient.actualizar occ='' | {"data": null, "error": "No tienes permisos. Se requiere uno de: patient.actualizar", "statusCode": 403} | **PASS** |
| PAT-04d | MJ-21 | qa_nurse2 borra paciente ajeno | 403; sigue vivo | 403 No tienes permisos. Se requiere uno de: patient.eliminar vivo=t | {"data": null, "error": "No tienes permisos. Se requiere uno de: patient.eliminar", "statusCode": 403} | **PASS** |
| PAT-04e | MJ-21 | Listado de qa_nurse2 no incluye al paciente de qa_nurse | no incluye | 200 n=21 incluye=False |  | **PASS** |
| PAT-04f | MJ-02 | Listado de qa_nurse (Ávila) incluye lo registrado por él y pacientes con citas en Ávila | incluye P1; n>1 | 200 n=70 incluye=True total=70 |  | **PASS** |
| PAT-04g | MJ-21 | (reclasificado) enfermero edita su paciente: rol sin patient.actualizar | BLOQUEADO: no se puede probar el alcance de escritura de personal no médico | 403 por permiso (patient.actualizar), no por alcance | enfermero solo tiene patient.consultar/crear (+parameters.consultar) | **BLOQUEADO** |
| PAT-04h | MJ-48 | (reclasificado) PATCH maritalStatus inválido por enfermero | BLOQUEADO por permiso; la validación se prueba con médico (PAT-10) | 403 por permiso |  | **BLOQUEADO** |
| PAT-05a | MJ-20 | cmendoza registra un paciente (sin cita todavía) | 201 | 201  | {"code": 201, "data": {"id": "589520fa-5097-4f24-b1bb-92d628bd9236", "commonPersonId": "7fc43836-4085-4829-b544-50e3160ce3db", "patientCode": "PAC-20… | **PASS** |
| PAT-05b | MJ-20 | cmendoza ve en su listado al paciente que registró | incluye | 200 incluye=True |  | **PASS** |
| PAT-05c | MJ-20 | cmendoza GET /patient/:id del que registró | 200 | 200 |  | **PASS** |
| PAT-05d | MJ-21 | rparedes GET /patient/:id del paciente de cmendoza (sin citas suyas) | 403 | 403 No tiene acceso a este paciente. | {"data": null, "error": "No tiene acceso a este paciente.", "statusCode": 403} | **PASS** |
| PAT-05e | MJ-21 | rparedes edita paciente ajeno | 403 | 403 No tiene acceso a este paciente. | {"data": null, "error": "No tiene acceso a este paciente.", "statusCode": 403} | **PASS** |
| PAT-05f | MJ-21 | rparedes borra paciente ajeno | 403 | 403 No tienes permisos. Se requiere uno de: patient.eliminar | {"data": null, "error": "No tienes permisos. Se requiere uno de: patient.eliminar", "statusCode": 403} | **PASS** |
| PAT-06a | MJ-21 | by-document accesible a personal de otro centro (sirve para agendar) y solo con identificación | 200; sin allergies/chronicDiseases/medications | 200 keys=['bloodType', 'commonPerson', 'commonPersonId', 'createdAt', 'createdBy', 'deletedAt', 'email', 'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelationship', 'id', 'insuranceCompany', 'insurancePolicyNumber', 'isActive', 'maritalSt… | {"id": "9e8f1d2c-f237-4037-b74a-b0f8bdfe8056", "commonPersonId": "6930736b-3be7-4baa-88a4-a74dbed54b01", "patientCode": "PAC-2026-00137", "maritalSta… | **PASS** |
| PAT-06b |  | by-document sin letter | 200 o 404 definido | 200 |  | **PASS** |
| PAT-06c | MJ-21 | by-document de paciente con alergias (admin): no devuelve alergias | sin allergies | 200 keys=['bloodType', 'commonPerson', 'commonPersonId', 'createdAt', 'createdBy', 'deletedAt', 'email', 'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelationship', 'id', 'insuranceCompany', 'insurancePolicyNumber', 'isActive', 'maritalSt… | ["bloodType", "commonPerson", "commonPersonId", "createdAt", "createdBy", "deletedAt", "email", "emergencyContactName", "emergencyContactPhone", "eme… | **PASS** |
| PAT-07 | MJ-21 | Paciente borrado: by-document devuelve 404 | DELETE 200; deleted_at no nulo; by-document 404 | delete=200 deleted=t by-document=404 Paciente con documento QA6000004 no encontrado | {"data": null, "error": "Paciente con documento QA6000004 no encontrado", "statusCode": 404} | **PASS** |
| PAT-08 | MJ-12 | Borrar paciente con cita pendiente | 409 No se puede eliminar …: tiene 1 cita(s) pendiente(s) o en curso…; paciente intacto | 409 No se puede eliminar el paciente: tiene 1 cita(s) pendiente(s) o en curso. Cancélelas o reprográmelas primero. vivo=t | {"data": null, "error": "No se puede eliminar el paciente: tiene 1 cita(s) pendiente(s) o en curso. Cancélelas o reprográmelas primero.", "statusCode… | **PASS** |
| PAT-09a | MJ-22 | GET /patient?order=ASC ordena por apellido, nombre (collation de la BD ignora tildes) | ordenado alfabéticamente por apellido, luego nombre | 200; Aguilar, Alfa, Arteaga(Aura,Carmen,Lucía…); únicas "inversiones" respecto a Python son tildes (Gómez<Gonzales, Pérez<Prueba) = collation es_ | primeros 12 ordenados; ver evidencia | **PASS** |
| PAT-09b | MJ-22 | GET /patient?order=DESC invierte el orden | Zeta, Zapata, Villalobos, Vélez… | 200; Zeta, Zapata x3, Villalobos, Vélez… |  | **PASS** |
| PAT-09c | MJ-22 | GET /patient?isActive=true\|false filtra (no se ignora) | ninguno inactivo en isActive=true | false n=0 true n=100 inactivos_en_true=0 | [] | **PASS** |
| PAR-aller | MJ-47 | Enfermero GET /allergies | 200 | 200  |  | **PASS** |
| PAR-chron | MJ-47 | Enfermero GET /chronic-diseases | 200 | 200  |  | **PASS** |
| PAR-medic | MJ-47 | Enfermero GET /medications | 200 | 200  |  | **PASS** |
| PAT-10a | MJ-48 | cmendoza PATCH maritalStatus inválido | 400 | 400 ['El estado civil debe ser uno de: soltero, casado, divorciado, viudo, union_libre'] | {"data": null, "error": ["El estado civil debe ser uno de: soltero, casado, divorciado, viudo, union_libre"], "statusCode": 400} | **PASS** |
| PAT-10-casado | MJ-48 | cmendoza PATCH maritalStatus casado | 200; BD | 200 BD=casado |  | **PASS** |
| PAT-10-divorciado | MJ-48 | cmendoza PATCH maritalStatus divorciado | 200; BD | 200 BD=divorciado |  | **PASS** |
| PAT-10-viudo | MJ-48 | cmendoza PATCH maritalStatus viudo | 200; BD | 200 BD=viudo |  | **PASS** |
| PAT-10-union_libre | MJ-48 | cmendoza PATCH maritalStatus union_libre | 200; BD | 200 BD=union_libre |  | **PASS** |
| DASH-01 | MJ-38 MJ-45 | Admin /dashboard/stats: scope=global y totales = BD | scope global; totalAppointments/Patients/MlAnalyses = conteo BD | 200 scope=global apps=327/327 pac=127/127 ml=93/93 | {"totalAppointments": 327, "pendingAppointments": 40, "completedAppointments": 226, "cancelledAppointments": 24, "todayAppointments": 0, "totalPatien… | **PASS** |
| DASH-02 | MJ-45 MJ-38 | cmendoza: scope=doctor, isDoctor, totales propios | scope doctor; totalAppointments = citas de cmendoza; ML = análisis de sus citas | 200 scope=doctor isDoctor=True apps=51/51 ml=15/15 medicos=8 | {"totalAppointments": 51, "pendingAppointments": 5, "completedAppointments": 35, "cancelledAppointments": 4, "todayAppointments": 0, "totalPatients":… | **PASS** |
| DASH-03 | MJ-38 MJ-02 | enf.ramirez (patient.consultar, centro Ávila): 200, scope=centers, datos de sus centros (no cero) | scope centers; totalAppointments = citas de Ávila; medicalCenterIds=[Ávila] | 200 scope=centers apps=175/175 pac=69 centros=1 ids=['3e6d7175-75a9-4e8b-b973-f5c41f3a362a'] | {"totalAppointments": 175, "pendingAppointments": 25, "completedAppointments": 120, "cancelledAppointments": 9, "todayAppointments": 0, "totalPatient… | **PASS** |
| DASH-04 | MJ-38 | enf.torres (Próceres) ve cifras distintas a las de Ávila | totalAppointments = citas de Próceres y distinto de enf.ramirez | 200 apps=44/44 (ramirez 175) centros=['7be4b22c-328c-4553-b292-9a22756ae9e1'] | {"totalAppointments": 44, "pendingAppointments": 3, "completedAppointments": 33, "cancelledAppointments": 3, "todayAppointments": 0, "totalPatients":… | **PASS** |
| DASH-05-recent-appoi | MJ-38 | enfermero GET /dashboard/recent-appointments | 200 | 200 {'code': 200, 'data': [{'id': '8bc2eae7-17e6-4dee-a855-a7bd6d066457', 'appointmentNumber': 'APT-2026-00349', 'appointmen | {'code': 200, 'data': [{'id': '8bc2eae7-17e6-4dee-a855-a7bd6d066457', 'appointmentNumber': 'APT-2026-00349', 'appointmentDate': '2026-12-14T15:30:00.… | **PASS** |
| DASH-05-appointments | MJ-38 | enfermero GET /dashboard/appointments-by-month | 200 | 200 {'code': 200, 'data': [{'month': 1, 'count': 0}, {'month': 2, 'count': 0}, {'month': 3, 'count': 0}, {'month': 4, 'count | {'code': 200, 'data': [{'month': 1, 'count': 0}, {'month': 2, 'count': 0}, {'month': 3, 'count': 0}, {'month': 4, 'count': 0}, {'month': 5, 'count': … | **PASS** |
| DASH-06 | AUTH | /dashboard/stats sin token | 401 | 401 | {"data": null, "error": "Token requerido para esta petición", "statusCode": 401} | **PASS** |
| DASH-07 | MJ-38 | cmendoza recent-appointments: todas son citas propias | n filas = n propias | 10 / propias 10 |  | **PASS** |
| DEP-01 | MJ-14 / createdBy | POST /departments con supportsMammography=true: createdBy desde la sesión | 201; BD supports_mammography=t, created_by=admin | 201 BD=t \| t \| resp.supportsMammography=True | {"code": 201, "data": {"id": "4f5d0f8e-ab94-4c37-961a-56490418c6ed", "name": "QA Depto Mama", "description": null, "medicalCenterId": "3e6d7175-75a9-… | **PASS** |
| DEP-02 | MJ-14 | POST /departments sin supportsMammography: por defecto false | 201; BD false | 201 BD=f | {"code": 201, "data": {"id": "d07c00e8-db15-44cc-a2ae-19a3c160aae1", "name": "QA Depto Sin", "description": null, "medicalCenterId": "3e6d7175-75a9-4… | **PASS** |
| DEP-03 | MJ-14 | PATCH /departments: supportsMammography=true y updatedBy | 200; BD t \| t | 200 BD=t \| t | {"code": 200, "data": {"id": "d07c00e8-db15-44cc-a2ae-19a3c160aae1", "name": "QA Depto Sin", "description": "editada", "medicalCenterId": "3e6d7175-7… | **PASS** |
| DEP-04 | MJ-14 | PATCH supportsMammography no booleano | 400 | 400 ['supportsMammography must be a boolean value'] | {"data": null, "error": ["supportsMammography must be a boolean value"], "statusCode": 400} | **PASS** |
| DEP-05 | MJ-14 | GET /departments devuelve supportsMammography | campo presente y true | 200 True | [{"id": "d07c00e8-db15-44cc-a2ae-19a3c160aae1", "name": "QA Depto Sin", "description": "editada", "medicalCenterId": "3e6d7175-75a9-4e8b-b973-f5c41f3… | **PASS** |
| DEP-06 | MJ-13 | POST /departments con specialtyIds inexistente | 400 Especialidades inexistentes: …; no se crea | 400 Especialidades inexistentes: 22222222-2222-4222-8222-222222222222. creados=0 | {"data": null, "error": "Especialidades inexistentes: 22222222-2222-4222-8222-222222222222.", "statusCode": 400} | **PASS** |
| DEP-06b | MJ-13 | POST /departments con centro inexistente | 404/400 | 404 Centro médico con ID 22222222-2222-4222-8222-222222222222 no encontrado. | {"data": null, "error": "Centro médico con ID 22222222-2222-4222-8222-222222222222 no encontrado.", "statusCode": 404} | **PASS** |
| DEP-06c | MJ-13 | PATCH /departments con medicalCenterId inexistente | 400/404; intacto | 404 Centro médico con ID 22222222-2222-4222-8222-222222222222 no encontrado. centro_intacto=True | {"data": null, "error": "Centro médico con ID 22222222-2222-4222-8222-222222222222 no encontrado.", "statusCode": 404} | **PASS** |
| DEP-07 | permisos | cmendoza (medico) POST /departments | 403 | 403 No tienes permisos. Se requiere uno de: departments.crear | {"data": null, "error": "No tienes permisos. Se requiere uno de: departments.crear", "statusCode": 403} | **PASS** |
| DEP-08 | MJ-12 | DELETE departamento con cita pendiente | 409 No se puede eliminar …: tiene 1 cita(s) pendiente(s) o en curso…; depto intacto | 409 No se puede eliminar el departamento: tiene 1 cita(s) pendiente(s) o en curso. Cancélelas o reprográmelas primero. vivo=t | {"data": null, "error": "No se puede eliminar el departamento: tiene 1 cita(s) pendiente(s) o en curso. Cancélelas o reprográmelas primero.", "status… | **PASS** |
| DEP-09 | MJ-12 | DELETE departamento tras cancelar la cita | 200; deleted_at no nulo | 200 deleted=t | {"code": 200} | **PASS** |
| MC-01 | MJ-12 | DELETE centro médico con cita pendiente | 409 No se puede eliminar …: tiene 1 cita(s) pendiente(s) o en curso… | 409 No se puede eliminar el centro médico: tiene 1 cita(s) pendiente(s) o en curso. Cancélelas o reprográmelas primero. vivo=t | {"data": null, "error": "No se puede eliminar el centro médico: tiene 1 cita(s) pendiente(s) o en curso. Cancélelas o reprográmelas primero.", "statu… | **PASS** |
| MC-02 | MJ-12 | DELETE centro tras cancelar la cita | 200 deleted_at | 200 deleted=t | {"code": 200} | **PASS** |
| HLT-01 | MJ-49 CA | GET /health sin token: 200 con indicadores database, memory_heap, redis, detector (up) | 200; status ok; 4 indicadores up | 200 status=ok indicadores=['database', 'detector', 'memory_heap', 'redis'] | {"code": 200, "data": {"status": "ok", "info": {"database": {"status": "up"}, "memory_heap": {"status": "up"}, "redis": {"status": "up"}, "detector":… | **PASS** |
| HLT-02 | MJ-49 | /health con medos-ml-api detenido | 503; error "Servicio no disponible: detector"; details.detector.status=down; database/redis up | 503 error=Servicio no disponible: detector detector={'status': 'down', 'message': 'fetch failed'} database={'status': 'up'} | {"data": null, "error": "Servicio no disponible: detector", "statusCode": 503, "details": {"database": {"status": "up"}, "memory_heap": {"status": "u… | **PASS** |
| HLT-03 | MJ-49 / robustez | Análisis con el detector caído devuelve error controlado (no 500 genérico) y no deja registro | 502/503/504 con mensaje; 0 análisis para el archivo | 503 El servicio de análisis no está disponible. filas=0 | {"data": null, "error": "El servicio de análisis no está disponible.", "statusCode": 503} | **PASS** |
| HLT-04 | MJ-49 | Tras reiniciar medos-ml-api, /health vuelve a 200 | 200 ok | 200 contenedor=healthy status=ok | {"code": 200, "data": {"status": "ok", "info": {"database": {"status": "up"}, "memory_heap": {"status": "up"}, "redis": {"status": "up"}, "detector":… | **PASS** |
| DCM-01 | MJ-42 | Barrido de conversiones DICOM: carpeta de 3 días eliminada al arrancar, la reciente se conserva | qa-old borrada, qa-new intacta; log "Conversiones DICOM vencidas eliminadas: 1" | ls tras docker restart: solo qa-new; log: eliminadas: 1 | mkdir qa-old (mtime -3d) + qa-new; docker restart medos-backend | **PASS** |
| DCM-02 | MJ-42 | Conversión DICOM real (POST /files/dicom/convert) y TTL horario | BLOQUEADO: sin archivo DICOM de prueba ni pydicom para generarlo; solo se probó el barrido de carpetas | no ejecutado |  | **BLOQUEADO** |
| USR-20 | MJ-03 | DELETE /users/:id de un usuario cuya persona es también médico: la persona NO se da de baja | 200; usuario borrado; persona viva; médico vivo | 200 usuario_borrado=t persona_viva=t; el médico siguió operable (PATCH isActive 200 en DOC-13, después del borrado del usuario) | nota: verificación de médico vivo por DOC-13 | **PASS** |
| USR-21 | MJ-03 | DELETE /users/:id de usuario con persona propia (sin paciente/médico): la persona sí se da de baja | 200; persona con deleted_at | 200 persona_viva=f | {"code": 200} | **PASS** |
| APT-30 | MJ-24 | Reprogramar una cita SIN centro (dato forzado por SQL) sin enviar medicalCenterId | 400 Indique el centro médico de la cita para reprogramarla. | 400 Indique el centro médico de la cita para reprogramarla. | {"data": null, "error": "Indique el centro médico de la cita para reprogramarla.", "statusCode": 400} | **PASS** |
| APT-30b | MJ-24 | Reprogramar enviando el centro | 200 y BD con centro y hora | 200 BD=3e6d7175-75a9-4e8b-b973-f5c41f3a362a \| 2026-12-16 09:30:00 | {"code": 200, "data": {"id": "ba5f5ce3-4c64-4de5-a736-640a0ffeec7f", "appointmentNumber": "APT-2026-00353", "appointmentDate": "2026-12-16T13:30:00.0… | **PASS** |
| CAT-01 | MJ-48 | Catálogo inexistente responde 404 en español | 404 con mensaje en español | 404 Estado no encontrado | {"data": null, "error": "Estado no encontrado", "statusCode": 404} | **PASS** |
| DAT-01 | MJ-05 datos | BD: usuarios VIVOS no-QA con first_login=true (las 18 cuentas se normalizaron) | 0 | 0 (los 4 restantes —asdasdasd, royfran, marco, alasdoasd— están dados de baja; la migración filtra deleted_at IS NULL) | 0 | **PASS** |
| DAT-02 | MJ-14 datos | BD: departamentos de Mamografía/Mastología con supportsMammography=true y ninguno sin él | true>0; false=0 | true=11 false=0 | 11 | **PASS** |
| DAT-03 | MJ-23 datos (informativo) | BD: personas previas sin birthDate (no hay de dónde inferirlo) | solo las nuevas con valor (seed/QA) | con_fecha_no_QA=0 | 0 | **PASS** |
| DAT-04 | MJ-50 datos | BD: historias de citas completadas distintas de completed | 0 | 0 | 0 | **PASS** |
| DAT-05 | MJ-26 datos (explicado) | BD: citas completadas sin historia VIVA | 0 (salvo la que dejé yo) | APT-2026-00343 (fixture C): su historia la borré yo en HIST-08; no es defecto | fixture propio | **PASS** |
| DAT-06 | MJ-24 datos | BD: citas sin centro (excluyendo el fixture forzado por SQL) | 0 | 0 | 0 | **PASS** |
| DAT-07 | MJ-32 datos | BD: archivos de cita con paciente distinto al de la cita | 0 | 0 | 0 | **PASS** |
| DAT-08 | MJ-32 datos | BD: análisis con paciente distinto al de su cita | 0 | 0 | 0 | **PASS** |
| DAT-09 | MJ-44 datos | BD: archivos con más de un análisis vivo | 0 | 0 | 0 | **PASS** |
| DAT-10 | MJ-19 datos (informativo; esperado 1 po… | BD: dos citas activas del mismo médico/centro/hora (sin cupo múltiple) | 0 excepto turnos con capacidad 2 (qa_doc1 10:00 y 10:30) | 1 | 1 | **PASS** |
| DOC-13 | MJ-16 CA-05 | Admin desactiva a un médico (isActive=false) | 200; BD isActive=f | 200 isActive=f | {"code": 200, "data": {"id": "b617e1ab-4bf7-449f-bda5-d0d87ac0bea2", "commonPersonId": "44d30476-c1bc-4c7a-83d4-6b2d4400fca1", "licenseNumber": "QA-L… | **PASS** |
| DOC-14 | MJ-16 CA-05 | Admin da de baja a un médico (DELETE /doctors/:id) | 200; deleted_at no nulo | 200 deleted=t | {"code": 200} | **PASS** |
| WALK-01 | Demo | Paso 1: admin abre el panel (/dashboard/stats) | 200 scope global con cifras | 200 scope=global citas=330 pacientes=130 | {"totalAppointments": 330, "pendingAppointments": 41, "completedAppointments": 226, "cancelledAppointments": 26, "todayAppointments": 0, "totalPatien… | **PASS** |
| WALK-02 | Demo | Paso 2: agenda de cmendoza (octubre) | 200; solo citas propias | 200 n=15 total=15 solo_propias=None | ["APT-2026-00304", "APT-2026-00305", "APT-2026-00306", "APT-2026-00307", "APT-2026-00308"] | **PASS** |
| WALK-03a | Demo turn picker | Paso 3a: available-dates de cmendoza (semana 21-dic) | incluye 2026-12-21 con slotsAvailable>0 | 200 [{'date': '2026-12-21', 'dayOfWeek': 1, 'slotsAvailable': 16}, {'date': '2026-12-22', 'dayOfWeek': 2, 'slotsAvailable': 16}, {'date': '2026-12-23', 'dayOfWeek': 3, 'slotsAvailable': 16}] | {"code": 200, "data": [{"date": "2026-12-21", "dayOfWeek": 1, "slotsAvailable": 16}, {"date": "2026-12-22", "dayOfWeek": 2, "slotsAvailable": 16}, {"… | **PASS** |
| WALK-03b | Demo turn picker | Paso 3b: availability del día: 16 turnos, elegir el 3.º libre | slots con start/end/capacity/booked/available | 200 n=16 libres=16 elegido={'start': '2026-12-21T13:00:00.000Z', 'end': '2026-12-21T13:30:00.000Z', 'capacity': 1, 'booked': 0, 'available': True} | {"start": "2026-12-21T13:00:00.000Z", "end": "2026-12-21T13:30:00.000Z", "capacity": 1, "booked": 0, "available": true} | **PASS** |
| WALK-03c | Demo CA-12 | Paso 3c: agendar con appointmentDate = inicio del turno y durationMinutes = duración del turno | 201 pending; BD 10:00 local (sin desfase de 4 h) | 201 BD=pending \| 2026-12-21 09:00:00 \| 30 | {"code": 201, "data": {"id": "e5d08e58-8311-47f7-9b9f-59c4163071e8", "appointmentNumber": "APT-2026-00354", "appointmentDate": "2026-12-21T13:00:00.0… | **PASS** |
| WALK-03d | Demo turn picker | Paso 3d: el turno elegido ahora figura completo | booked=1, available=false | {'start': '2026-12-21T13:00:00.000Z', 'end': '2026-12-21T13:30:00.000Z', 'capacity': 1, 'booked': 1, 'available': False} | {"start": "2026-12-21T13:00:00.000Z", "end": "2026-12-21T13:30:00.000Z", "capacity": 1, "booked": 1, "available": false} | **PASS** |
| WALK-04 | Demo | Paso 4: confirmar → iniciar → finalizar con receta | 200/200/200; cita completed; historia completed con exámenes; 1 receta | 200/200/200; cita=completed; historia=completed \| t \| 1 | {"db": ["completed", "completed \| t \| 1"]} | **PASS** |
| WALK-05a | Demo | Paso 5a: subir variante de mamografía a la cita (completada) | 201 | 201  | {"code": 201, "data": {"appointmentId": "e5d08e58-8311-47f7-9b9f-59c4163071e8", "medicalHistoryId": "35a26e93-0580-4df3-bfc2-3500f0b77216", "patientI… | **PASS** |
| WALK-05b | Demo MJ-36 | Paso 5b: analizar (server-side) | 201 con label neutra y probabilidades | 201 label=No sospechoso p=18.45 status=success | {"label": "No sospechoso", "prediction": "BENIGN", "malignancyProbability": 18.45, "rawScore": 0.8155064582824707, "threshold": 0.15, "doctorAgreemen… | **PASS** |
| WALK-05c | Demo MJ-35 | Paso 5c: bandeja (recent, fecha de la cita, solo pendientes) lista el análisis | incluye el id; sin BI-RADS | 200 incluye=True biRads=False | {"code": 200, "data": [{"id": "0cdae76e-9378-4679-9a40-f24cae07eef7", "appointmentId": "e5d08e58-8311-47f7-9b9f-59c4163071e8", "appointmentFileId": "… | **PASS** |
| WALK-05d | Demo MJ-34 | Paso 5d: revisar desde la bandeja | 200; BD is_reviewed=t, accepted | 200 BD=t \| accepted \| uncertain | {"code": 200, "data": {"id": "0cdae76e-9378-4679-9a40-f24cae07eef7", "appointmentId": "e5d08e58-8311-47f7-9b9f-59c4163071e8", "appointmentFileId": "c… | **PASS** |
| AUD-09 | MJ-39 | POST /admin/login fallido queda en access-log como login_failed con la credencial escrita | fila login_failed, userId null, resourceId=qa_adminghost | 401 BD=1 \| 401 | 1 \| 401 | **PASS** |
| CON-01 | RN-06b / MJ-19 turno | Reservas simultáneas del mismo turno (capacidad 1) del mismo médico (admin, 6-8 hilos paralelos) | exactamente 1 cita por turno (resto 400) | Corrida 1 (6 hilos, 22-dic 10:00): [201,201,400x4] → 2 citas; corrida 2 (8 hilos, 23-dic): [201,400x7] → 1; corrida 3 (6 hilos, 24-dic): [201x5,400] → 5 citas; corrida 4 (6, 28-dic): 201x6 → 6 citas; corrida 5 (6, 29-dic): 201x6 → 6 citas | BD: 2026-12-22 10:00→2, 12-23→1, 12-24→5, 12-28→6, 12-29→6 citas activas de cmendoza en el mismo turno de capacidad 1 | **FAIL** |
| ABU-01 | DTO | appointmentDate no ISO | 400 | 400 ['appointmentDate must be a valid ISO 8601 date string'] | {"data": null, "error": ["appointmentDate must be a valid ISO 8601 date string"], "statusCode": 400} | **PASS** |
| ABU-02 | DTO | patientId no UUID | 400 | 400 ['patientId must be a UUID'] | {"data": null, "error": ["patientId must be a UUID"], "statusCode": 400} | **PASS** |
| ABU-03 | RN-11 | doctorId inexistente (médico no admin) | 403/404; sin huérfanos | 403 Un médico solo puede agendar citas a su nombre. personas=0 | {"data": null, "error": "Un médico solo puede agendar citas a su nombre.", "statusCode": 403} | **PASS** |
| ABU-03b | RN-06 | doctorId inexistente (admin) | 404; sin huérfanos | 404 Médico con ID 11111111-1111-4111-8111-111111111111 no encontrado. personas=0 | {"data": null, "error": "Médico con ID 11111111-1111-4111-8111-111111111111 no encontrado.", "statusCode": 404} | **PASS** |
| ABU-04 | robustez | reason de 20 000 caracteres | 400 o 201 sin error 500 | 201 None personas=1 | {'code': 201, 'data': {'id': 'd885d049-4937-4496-ac60-7c63dacb7f26', 'appointmentNumber': 'APT-2026-00357', 'appointmentDate': '2026-12-22T15:00:00.0… | **PASS** |
| ABU-05 | robustez | search con payload SQL | 200 lista vacía, sin 500; tabla intacta | 200 n=0 patients=138 | {'code': 200, 'data': [], 'total': 0, 'page': 1, 'limit': 5} | **PASS** |
| ABU-06 | robustez | limit=100000 | 400 (tope) o 200 acotado, nunca error 500 | 200 n=133 | {'code': 200, 'data': [{'id': '4a8cf21a-6f28-4f07-b163-15d6fe94fdcf', 'commonPersonId': '0146cb4f-d1 | **PASS** |
| ABU-07 | turn picker (validación de query) | availability con doctorId y medicalCenterId no UUID ("zzz") | 400 | 500 Error interno del servidor. | GET availability?doctorId=zzz… → 500 | **FAIL** |
| ABU-08 | turn picker | availability con date="22-12-2026" (formato DD-MM-AAAA) | 400 | 200 con slots=[] y available=false (la fecha se interpreta sin error) |  | **FAIL** |
| ABU-09 | turn picker (informativo) | cmendoza consulta availability de rparedes (lectura de agenda ajena) | 200 (solo ocupación/turnos, sin datos de pacientes) o 403 | 200 claves=['occupiedSlots', 'schedule', 'slots', 'currentCount', 'available'] occupied_fields=n/a | {'code': 200, 'data': {'occupiedSlots': [], 'schedule': [{'startTime': '13:00:00', 'endTime': '18:00:00', 'maxDailyAppointments': 16}], 'slots': [{'s… | **PASS** |
| ABU-10 | turn picker | availability con centro donde el médico no trabaja | 200 vacío (sin turnos) o 400 | 200 slots=0 available=False | {'code': 200, 'data': {'occupiedSlots': [], 'schedule': [], 'slots': [], 'currentCount': 0, 'available': False}} | **PASS** |
| CON-02 | RN-09 | Número APT bajo la misma ráfaga: sin 500 ni duplicados | sin 500 en la ráfaga; appointment_number únicos | sin 500 observados; 24 citas creadas, números únicos | ver CON-01 | **PASS** |
| ABU-11 | turn picker | availability con date="basura" | 400 | 500 Error interno del servidor. | GET availability?date=basura → 500 | **FAIL** |
| ABU-12 | turn picker | available-dates con doctorId="zzz" | 400 | 500 Error interno del servidor. |  | **FAIL** |
| REC-10 | HU-07.2 CA-07 / RN-08 | HU-07.2 CA-07 literal: PATCH receta con medicalAppointmentId de otra cita + notes | HU dice: 200, notes cambia, medicalAppointmentId intacto | 400 ['medicalAppointmentId no se puede cambiar en una receta emitida.'] (la guía de integración del bloque dice 400) | HU desactualizada respecto de MJ-28 (api d3eebf2/2aa8053) | **FAIL** |
| REC-11 | HU-07.2 CA-01 | HU-07.2 CA-01: receta activa → dispensar → ya no se puede anular | 200 dispensed; cancel 400 | 200 status=dispensed; cancel 400 No se puede cancelar una receta que ya ha sido dispensada. | {"data": null, "error": "No se puede cancelar una receta que ya ha sido dispensada.", "statusCode": 400} | **PASS** |
| REC-12 | HU-07.2 CA-02 | HU-07.2 CA-02: receta cancelada → dispensar | cancel 200; dispense 400 | cancel 200 cancelled; dispense 400 Solo se pueden marcar como dispensadas las recetas activas. | {"data": null, "error": "Solo se pueden marcar como dispensadas las recetas activas.", "statusCode": 400} | **PASS** |
| REC-13 | HU-07.2 CA-04 | HU-07.2 CA-04: imprimir receta (PDF) | BLOQUEADO: la impresión es del navegador (jsPDF en el front); no hay endpoint de PDF en la API | no ejecutable sin navegador |  | **BLOQUEADO** |
| PREV-01 | HU-09.2 | HU-09.2 CA-01/05: vista previa de mamografía JPG: resultado, label neutra, sin crear análisis | 200/201 con label neutra; conteo de análisis igual | 201 label=No sospechoso prediction=BENIGN análisis 99→99 | {"label": "No sospechoso", "prediction": "BENIGN", "malignancyProbability": 16.629934310913086, "rawScore": 0.8337006568908691} | **PASS** |
| PREV-02 | HU-09.2 | HU-09.2 CA-02: imagen en color (no es mamografía) | 422 | 422 La imagen no parece una mamografía válida para el modelo. | {"data": null, "error": "La imagen no parece una mamografía válida para el modelo.", "statusCode": 422} | **PASS** |
| PREV-03 | robustez | Preview con archivo no imagen (text/plain) | 400/415 controlado (no 500) | 415 Formato de archivo no soportado para el análisis. | {"data": null, "error": "Formato de archivo no soportado para el análisis.", "statusCode": 415} | **PASS** |
| PREV-04 | permisos | Enfermero usa el preview (sin permiso del módulo) | 403 | 403 No tienes permisos. Se requiere uno de: mammography-analysis.crear | {"data": null, "error": "No tienes permisos. Se requiere uno de: mammography-analysis.crear", "statusCode": 403} | **PASS** |
| SES-01 | HU-00.3 CA-02 | HU-00.3 CA-02: usar dos veces el mismo refresh | 1.º 200/201 con tokens nuevos; 2.º 401 Refresh token inválido | 1.º 201; 2.º 401 Refresh token inválido | {"data": null, "error": "Refresh token inválido", "statusCode": 401} | **PASS** |
| SES-02 | HU-00.3 CA-04 | HU-00.3 CA-04: logout y reutilizar el token | logout 200/201; luego 401 "Sesión expirada o cerrada" | logout 201; /auth/me 401 Sesión expirada o cerrada | {"data": null, "error": "Sesión expirada o cerrada", "statusCode": 401} | **PASS** |
| SES-03 | HU-00.3 CA-05 | HU-00.3 CA-05: médico sin role.crear llama POST /roles: 403 y la sesión sigue | 403; /auth/me 200 | 403 No tienes permisos. Se requiere uno de: role.crear; /auth/me 200 | {"data": null, "error": "No tienes permisos. Se requiere uno de: role.crear", "statusCode": 403} | **PASS** |
| SES-04 | HU-00.3 CA-03 | HU-00.3 CA-03: administrador desactiva al usuario; su sesión abierta recibe 401 | PATCH 200; 401 | PATCH 200 ; /auth/me 401 Sesión expirada o cerrada | {"data": null, "error": "Sesión expirada o cerrada", "statusCode": 401} | **PASS** |
| SES-04b | HU-00.3 | Reactivar al usuario permite iniciar sesión de nuevo | 200 / login 201 | 200 / 201 |  | **PASS** |
| RST-01 | HU-01.6 CA-07 | HU-01.6 CA-07: restablecer contraseña de un usuario borrado | 404 | 404 Usuario con ID 6a97fa34-6fba-4813-91f7-2d60e040195c no encontrado. | {"data": null, "error": "Usuario con ID 6a97fa34-6fba-4813-91f7-2d60e040195c no encontrado.", "statusCode": 404} | **PASS** |
| RST-02 | HU-01.6 CA-06 | HU-01.6 CA-06: actor con user.actualizar pero sin role.actualizar → 403 "No tiene permiso para restablecer contraseñas." | BLOQUEADO: no existe un rol con esa combinación en el ambiente (habría que crear rol y matriz de permisos); el médico y el enfermero sí dan… | no ejecutado |  | **BLOQUEADO** |
| AUD-10 | HU-13.3 CA-02 | HU-13.3 CA-02: POST /roles (201) deja fila write/roles y la fila no contiene nombre del rol ni cuerpo | fila write, resource roles, sin "qa_rol_audit" | 200 filas=2 contiene_nombre=False | [{"id": "1b7bafc0-0fbe-482b-ba73-1dd855652656", "createdAt": "2026-10-04T23:53:49.303Z", "userId": "0d47fb45-9753-44b7-b1a6-06a73f803d27", "method": … | **PASS** |
| AUD-11 | HU-13.3 CA-04 | HU-13.3 CA-04: GET /patient?search=Pérez se registra con path /patient (sin query) | paths sin "?" | 200 paths=['/patient'] | [{"id": "5a7fa367-0263-4718-85ee-081770532b50", "createdAt": "2026-10-04T23:53:51.667Z", "userId": "00709eb2-63a2-4168-ad25-2eec990476e8", "method": … | **PASS** |
| AUD-12 | HU-13.3 CA-08 | HU-13.3 CA-08: consultar la bitácora y /auth/me no genera filas | conteo igual (+0) | 229→229 |  | **PASS** |
| AUD-13 | HU-13.3 CA-05 | HU-13.3 CA-05: rparedes pide un análisis ajeno (403): no hay fila | 403; filas de rparedes igual | 403; 1→1 |  | **PASS** |
| BE-01 | Suites | Suite backend: npx jest --ci | 592 tests verdes (baseline 592) | Test Suites: 76 passed, 76 total; Tests: 592 passed, 592 total (54 s) | salida de jest en la corrida | **PASS** |
| FE-01 | Frontend | Frontend: npx ng test --watch=false --browsers=ChromeHeadless | 153/153 (baseline 153) | TOTAL: 153 SUCCESS (Chrome Headless 154) |  | **PASS** |
| FE-02 | Frontend | Frontend: ng build, bundle inicial < 500 kB | Initial total < 500 kB | Initial total 455.18 kB (118.41 kB transferido); sin errores; git status limpio tras el build |  | **PASS** |
| FE-03 | Frontend | Frontend desplegado: curl http://localhost:8007 | 200 | 200 |  | **PASS** |
| FE-04 | Frontend turn picker | El bundle servido contiene el selector de turnos | cadenas/endpoint del selector en los chunks | chunk-TOZIAQJX.js contiene "Pasado"; chunk-2MTK7NCP/CYL5IPOI/DNLVYJGE/TOZIAQJX contienen "Completo"; chunk-34KQMJ65.js contiene "availability" y "available-dates" | docker exec medos-frontend grep -l … | **PASS** |
| FE-05 | Frontend | Specs del front cubren selector de turnos, acciones rápidas, citas cerradas y gating por permisos | specs presentes y verdes | appointment-form.component.spec.ts (describe "turn picker": 10 casos + edición), patient-detail.spec (acciones rápidas), consultation/appointment-detail.spec (cita cerrada), home.page/user-form/doctor-form/review-inbox specs (permisos); todos dentro de los 15… |  | **PASS** |
| ML-01 | Suites | Detector: docker build --target test (pytest) | 30 passed (baseline 30) | 30 passed, 2 warnings in 10.52 s |  | **PASS** |
| BLQ-01 | MJ-09 | MJ-09: matriz de permisos en una transacción (fallo a mitad no deja matriz parcial) | BLOQUEADO: requiere inyectar un fallo en la 2.ª escritura; no hay forma desde la API | no ejecutado (cubierto solo por test unitario del repo) |  | **BLOQUEADO** |
| BLQ-02 | MJ-40 | MJ-40: evaluación del modelo / orden de clases | BLOQUEADO por diseño (parcial: sin casos etiquetados); solo se verificó la nota "orientativo" por spec/HU, no en UI | no ejecutado |  | **BLOQUEADO** |
| BLQ-03 | MJ-46 MJ-11 | El login sigue aceptando contraseñas de 6 caracteres (legado) | BLOQUEADO: no se puede crear un usuario de 6 caracteres por API y no se alteraron hashes de demo | no ejecutado |  | **BLOQUEADO** |
| BLQ-04 | MJ-50 | finish-consultation: rol con appointments.actualizar pero SIN medical-history.crear | BLOQUEADO: no existe tal rol y no se crearon matrices de permisos; solo enfermero (403) y médico (200) | no ejecutado |  | **BLOQUEADO** |
| BLQ-05 | HU-00.2 HU-01.6 CA-02 HU-05.x UI | Casos de interfaz (selector de turnos visual, redirección por mustChangePassword, sidebar, avisos de cita cerrada) | BLOQUEADO: no hay navegador; solo specs y bundle | no ejecutado |  | **BLOQUEADO** |

## 5. Hallazgos

Se reporta el síntoma; las causas son hipótesis y están marcadas así.

### H-01 · ALTA · Reservas simultáneas exceden la capacidad del turno (RN-06b de HU-05.1, MJ-19)

**Síntoma.** Varias peticiones `POST /medical-appointments` concurrentes al mismo turno de un médico con 1 paciente por turno devuelven 201 más de una vez; en la BD quedan varias citas activas del mismo médico, centro y hora. Es un camino alcanzable por API (dos recepcionistas o un doble clic), rompe una regla de negocio y deja datos inconsistentes (pacientes duplicados en un mismo turno).

**Request (idéntico en cada hilo, token de `admin.caracas`, 6 hilos en paralelo, `doctorId` = `cmendoza`, turno 10:00 local = `14:00:00Z`, un documento distinto por hilo):**

```json
POST /medical-appointments
{"documentLetter":"V","documentNumber":"QA7400000","newPatientData":{"commonPerson":{"letter":"V","documentNumber":"QA7400000","firstName":"QAPac000","lastName":"Prueba"}},
 "doctorId":"c5104979-23ae-45a7-aeb1-199baa3c48f8","medicalCenterId":"3e6d7175-75a9-4e8b-b973-f5c41f3a362a",
 "appointmentDate":"2026-12-24T14:00:00.000Z","type":"first_visit","reason":"QA","durationMinutes":30}
```

**Resultados (5 corridas, cada una en un turno distinto y vacío; capacidad 1):**

| Turno (local) | Hilos | Códigos | Citas activas en BD para ese turno |
|---|---|---|---|
| 2026-12-22 10:00 | 6 | 201, 201, 400×4 | 2 |
| 2026-12-23 10:00 | 8 | 201, 400×7 | 1 (correcto) |
| 2026-12-24 10:00 | 6 | 201×5, 400 | **5** |
| 2026-12-28 10:00 | 6 | 201×6 | **6** |
| 2026-12-29 10:00 | 6 | 201×6 | **6** |

Los números `APT-…` no se duplicaron (ningún 500), y el 400 correcto (`"El turno de las 10:00 ya está completo: admite 1 paciente(s) y tiene 1."`) sí aparece en secuencia (CAP-02, APT-06). **Paso a paso:** crear un médico con bloque de 1 paciente por turno; lanzar 6 `POST` simultáneos al mismo turno con documentos distintos; contar `SELECT count(*) FROM medical_appointments WHERE doctor_id=… AND appointment_date=… AND status<>'cancelled'`.

**Hipótesis (no verificada):** la validación de cupo de turno y de cupo diario es "consultar y luego insertar" sin bloqueo ni restricción de BD en la ruta de alta (patrón ya anotado como H20 en `docs/plans/2026-09-25-backend-hallazgos.md`, nunca cerrado). Probablemente el cupo diario tenga la misma carrera (no se probó por separado).

### H-02 · MEDIA · `availability` y `available-dates` responden 500 ante parámetros mal formados

**Síntoma.** El selector de turnos depende de estos endpoints; un id que no es UUID o una fecha inválida produce `500 "Error interno del servidor."` en vez de 400. Una fecha en formato `DD-MM-AAAA` se acepta y devuelve la grilla vacía.

```
GET /medical-appointments/availability?doctorId=zzz&date=2026-12-22&medicalCenterId=<uuid>   → 500 {"data":null,"error":"Error interno del servidor.","statusCode":500}
GET /medical-appointments/availability?doctorId=<uuid>&date=basura&medicalCenterId=<uuid>   → 500 (ídem)
GET /medical-appointments/availability?doctorId=<uuid>&date=2026-12-22&medicalCenterId=zzz  → 500 (ídem)
GET /medical-appointments/available-dates?doctorId=zzz&medicalCenterId=<uuid>&startDate=2026-12-01&endDate=2026-12-14 → 500
GET /medical-appointments/availability?doctorId=<uuid>&date=22-12-2026&medicalCenterId=<uuid>  → 200 {"occupiedSlots":[],"schedule":[],"slots":[],"currentCount":0,"available":false}
```

Casos: ABU-07, ABU-08, ABU-11, ABU-12. Los demás endpoints de cita validan sus UUID con 400 (ABU-02). **Hipótesis:** esos query params no pasan por un DTO con `@IsUUID`/`@IsDateString`.

### H-03 · MEDIA · `PATCH /medical-appointments/:id` con centro inexistente responde 400 "no asignado", no 404

**Síntoma.** La guía (`2026-10-04-mejoras-bloque-integracion-frontend.md`, fila "`POST`/`PATCH` con `medicalCenterId` inexistente o borrado → 404") se cumple en `POST` (APT-03: `404 Centro médico con ID … no encontrado.`) pero no en `PATCH`.

```
PATCH /medical-appointments/<id>  {"appointmentDate":"2026-12-14T14:30:00.000Z","medicalCenterId":"11111111-1111-4111-8111-111111111111"}
→ 400 {"data":null,"error":"El médico no está asignado a este centro médico.","statusCode":400}
```

Caso CAP-17. Impacto: el front que "trata 404 como centro inválido" no lo distingue de "médico fuera del centro". **Hipótesis:** en el `PATCH` la pertenencia del médico se valida antes de la existencia del centro.

### H-04 · MEDIA · "BI-RADS" sigue en la API para análisis legados (MJ-36)

**Síntoma.** La guía afirma que las etiquetas pasaron a `Sospechoso de malignidad` / `No sospechoso` "también en la respuesta cruda". Los análisis nuevos y el campo `label` están bien (MAM-06b, PREV-01, WALK-05b), pero **22 análisis vivos (24 con borrados, creados 2026-06-09…06-16)** conservan `raw_response.raw.label = "Neoplasia Maligna (BI-RADS 4/5)"` y la API lo devuelve en `rawResponse`.

```
GET /mammography-analyses/08127e07-935c-4961-bbce-548548b51de0 (admin) → 200
"label":"Sospechoso de malignidad", "rawResponse":{"raw":{"label":"Neoplasia Maligna (BI-RADS 4/5)","status":"danger","prediction":"MALIGNO","probability":99.21…}, "label":"Sospechoso de malignidad", …}
```

SQL: `SELECT count(*) FROM mammography_analyses WHERE label ILIKE '%bi-rads%'` → **0**; `… WHERE raw_response::text ILIKE '%bi-rads%'` → **24**; también `GET /mammography-analyses/recent?dateFrom=2026-06-01&dateTo=2026-06-30` contiene la cadena. El front no lee `rawResponse` (`rg rawResponse app-gestion-medica/src` → 0), así que el efecto visible es nulo hoy. Casos MAM-13, MAM-13b. **Hipótesis:** la migración reescribió `raw_response->label` pero no el `raw.label` anidado (en el código, `detector.client.ts:160` conserva el texto crudo a propósito). Las notas libres de médicos (27 filas) que dicen "BI-RADS 2" son texto de usuario y no se cuentan.

### H-05 · BAJA · HU-07.2 (RN-08, CA-07) describe un comportamiento anterior

La HU dice que `PATCH /recipes/:id` con `medicalAppointmentId` (u otros campos fijos) "los descarta sin error" y responde 200. El sistema devuelve 400 (MJ-28; coincide con la guía de integración):

```
PATCH /recipes/2e7c7a3e-… {"medicalAppointmentId":"<otra cita>","notes":"Nota CA-07"} → 400 {"error":["medicalAppointmentId no se puede cambiar en una receta emitida."]}
```

Caso REC-10 (FAIL contra la HU tal como está escrita; el comportamiento es el deseado según MJ-28). Falta actualizar la HU.

### H-06 · BAJA · `reason` de la cita sin tope de longitud

`POST /medical-appointments` con `reason` de 20 000 caracteres → 201 (ABU-04). No es corrupción; es ausencia de límite. Se deja como observación (el caso figura PASS porque la expectativa era "sin 500").

### H-07 · BAJA (observación de cobertura) · alcance de escritura de personal no médico no ejercible

El rol `enfermero` solo tiene `patient.consultar/crear` (+ `parameters.consultar`); `PATCH`/`DELETE /patient/:id` dan 403 por **permiso**, no por alcance (PAT-04c/d, PAT-04g/h BLOQUEADO). Por tanto la regla "escrituras de paciente acotadas por centros" de MJ-21 solo se verificó para médicos (PAT-05d/e/f, rparedes sobre paciente de cmendoza → 403).

### Lo que está bien resuelto (no tocar)

- Alta de cita transaccional: toda cita rechazada (turno lleno, cupo, horario, estado, centro) deja 0 `persona_comun` y 0 pacientes (APT-04b/06c/09b/13c/15b, CAP-06b/10b); validaciones previas a escribir en `medical-appointments.service.ts` (`create`).
- Reemplazo atómico de horario: un bloque inválido en el payload deja el horario previo intacto (SCH-03b, SCH-04).
- Cupo diario como suma de bloques y `availability` con todos los turnos `available:false` al llenarse (CAP-07c, CAP-09..CAP-12).
- Bloqueo de login por credencial (incluida una inexistente, sin revelar cuentas) con reinicio por login correcto, y registro `login_failed` sin contraseña (AUTH-02..04, AUD-01, AUD-09).
- Reinicio de contraseña revoca la sesión y marca `mustChangePassword` (USR-12, USR-12b/d, USR-13).
- Cierre de consulta atómico: nada se escribe si el DTO falla (TR-18) y una sola historia por cita (TR-22b); `quantity` y `requestedExams` persistidos (TR-19).
- Archivos y análisis: paciente/centro/historia derivados de la cita, 403/404/409 distintos y correctos (MAM-01..MAM-08), borrado con motivo recortado y `deleted_by` (MAM-12e).
- `/health` nombra el indicador caído y vuelve a 200 al reiniciarlo (HLT-02, HLT-04); con el detector caído el análisis responde 503 controlado sin dejar registro (HLT-03).

## 6. Cobertura

### 6.1 Por mejora (MJ)

| MJ | Casos | PASS | FAIL | BLOQ. | Nota |
|---|---|---|---|---|---|
| MJ-01 | AUTH-02, AUTH-02b, AUTH-03, AUTH-04, AUD-01, AUTH-05, USR-12d | 7 | 0 | 0 | TOTP queda fuera del alcance de la mejora. |
| MJ-02 | PAT-04a, PAT-04b, PAT-04f, DASH-03 | 4 | 0 | 0 |  |
| MJ-03 | USR-20, USR-21 | 2 | 0 | 0 |  |
| MJ-04 | USR-10-list-cmen, USR-10-get-cmen, USR-10-patch-cmen, USR-10-list-enf., USR-10-get-enf., … | 8 | 0 | 0 |  |
| MJ-05 | USR-11-pre, USR-11-medicoico, USR-11-enfermeroero, USR-11-adminres, USR-11-adminsmo, USR-… | 14 | 0 | 0 |  |
| MJ-06 | AUTH-01-cmendoza, AUTH-01-enf.ramirez, AUTH-01-admin.caracas, AUTH-01-admin.regional | 4 | 0 | 0 |  |
| MJ-07 | ROLE-01, ROLE-02, ROLE-03, ROLE-04-superusuario, ROLE-04-medico | 5 | 0 | 0 |  |
| MJ-08 | ROLE-05, ROLE-06, ROLE-07 | 3 | 0 | 0 |  |
| MJ-09 | BLQ-01 | 0 | 0 | 1 | Atomicidad de la matriz: BLOQUEADO (BLQ-01), solo la lectura de `/permissions/role/:id` (MJ-08) se ejecutó. |
| MJ-10 | MENU-01, MENU-02 | 2 | 0 | 0 |  |
| MJ-11 | USR-01, USR-02, USR-03, USR-02b, BLQ-03 | 4 | 0 | 1 | Solo mínimo de 8 en `/users-security`; login con 6 (legado): BLOQUEADO (BLQ-03). |
| MJ-12 | PAT-08, DEP-08, DEP-09, MC-01, MC-02 | 5 | 0 | 0 |  |
| MJ-13 | DOC-08a, DOC-08b, DEP-06, DEP-06b, DEP-06c | 5 | 0 | 0 |  |
| MJ-14 | DEP-01, DEP-02, DEP-03, DEP-04, DEP-05, DAT-02 | 6 | 0 | 0 |  |
| MJ-15 | DOC-10, DOC-11, DOC-11b | 3 | 0 | 0 |  |
| MJ-16 | DOC-02, DOC-01, DOC-03a, DOC-13, DOC-14 | 5 | 0 | 0 |  |
| MJ-17 | DOC-00, DOC-04a, DOC-04b | 3 | 0 | 0 |  |
| MJ-18 | SCH-06, SCH-06b, SCH-07, SCH-08, SCH-09 | 5 | 0 | 0 |  |
| MJ-19 | SCH-01, DAT-10, CON-01 | 2 | 1 | 0 | Ver H-01 (carrera). |
| MJ-20 | PAT-05a, PAT-05b, PAT-05c | 3 | 0 | 0 |  |
| MJ-21 | PAT-04a, PAT-04b, PAT-04c, PAT-04d, PAT-04e, PAT-04g, PAT-05d … | 11 | 0 | 1 | Escritura de personal no médico: ver H-07. |
| MJ-22 | PAT-09a, PAT-09b, PAT-09c | 3 | 0 | 0 |  |
| MJ-23 | DOC-09-birthDat, DOC-09-sex X, DOC-09-ok, PAT-01, PAT-02-maritalStatusre, PAT-02-birthDat… | 9 | 0 | 0 |  |
| MJ-24 | APT-01, APT-02, APT-03, APT-04, APT-05, CAP-01, CAP-09 … | 14 | 1 | 0 | Ver H-03 (PATCH con centro inexistente). |
| MJ-25 | APT-04b, APT-05, APT-06c | 3 | 0 | 0 |  |
| MJ-26 | APT-13, APT-13b, APT-14, TR-01, TR-02, TR-03, TR-05 … | 12 | 0 | 0 |  |
| MJ-27 | TR-15-confirm, TR-15-start-consultation, TR-15-cancel, TR-15-finish, TR-15-PATCH, TR-15-r… | 22 | 0 | 0 |  |
| MJ-28 | REC-01-medicalAppointmentId, REC-01-patientId, REC-01-doctorId, REC-01-medicalHistoryId, … | 13 | 0 | 0 |  |
| MJ-29 | TR-04, TR-13, TR-20 | 3 | 0 | 0 |  |
| MJ-30 | TR-10a, TR-10b, TR-10c, TR-10d, TR-11 | 5 | 0 | 0 |  |
| MJ-31 | TR-18-31 exá, TR-18-name d, TR-18-notes, TR-18-name v, TR-19, HIST-01, HIST-07 … | 8 | 0 | 0 |  |
| MJ-32 | MAM-02a, MAM-02b, MAM-02c, MAM-02d, MAM-03a, MAM-03b, MAM-03c … | 15 | 0 | 0 |  |
| MJ-33 | MAM-05a, MAM-06, MAM-10a, MAM-09e | 4 | 0 | 0 |  |
| MJ-34 | MAM-10c, MAM-10d, WALK-05d | 3 | 0 | 0 |  |
| MJ-35 | MAM-09, WALK-05c | 2 | 0 | 0 |  |
| MJ-36 | MAM-06, MAM-06b, MAM-09, MAM-13, MAM-13b, WALK-05b | 4 | 2 | 0 | Ver H-04. |
| MJ-37 | MAM-11a, MAM-12b, MAM-12c, MAM-12d, MAM-12e, MAM-12f | 6 | 0 | 0 |  |
| MJ-38 | DASH-01, DASH-02, DASH-03, DASH-04, DASH-05-recent-appoi, DASH-05-appointments, DASH-07 | 7 | 0 | 0 |  |
| MJ-39 | AUD-01, AUD-01b, AUD-02, AUD-03, AUD-04, AUD-05, AUD-06 … | 11 | 0 | 0 |  |
| MJ-40 | BLQ-02 | 0 | 0 | 1 | Parcial/bloqueada por diseño (BLQ-02). |
| MJ-41 | HIST-01, HIST-08 | 2 | 0 | 0 |  |
| MJ-42 | DCM-01, DCM-02 | 1 | 0 | 1 | Solo el barrido de carpetas; conversión DICOM real: BLOQUEADO (DCM-02). |
| MJ-43 | FOTO-02, FOTO-03, FOTO-05, FOTO-07, DOC-12a, PAT-03c | 6 | 0 | 0 |  |
| MJ-44 | MAM-07, MAM-12g, DAT-09 | 3 | 0 | 0 |  |
| MJ-45 | DASH-01, DASH-02 | 2 | 0 | 0 | Conteos del panel contra SQL (DASH-01..04). |
| MJ-46 | USR-01, USR-13a, USR-13c, FOTO-01, FOTO-04, FOTO-05, FOTO-06 … | 9 | 0 | 1 |  |
| MJ-47 | PAR-aller, PAR-chron, PAR-medic | 3 | 0 | 0 |  |
| MJ-48 | PAT-01, PAT-02-maritalStatusre, PAT-02-birthDatera, PAT-02-sex X, PAT-02-sex f, PAT-04h, … | 11 | 0 | 1 |  |
| MJ-49 | HLT-01, HLT-02, HLT-03, HLT-04 | 4 | 0 | 0 |  |
| MJ-50 | TR-17, TR-19, TR-23, HIST-03, DAT-04, BLQ-04 | 5 | 0 | 1 | Rol sin `medical-history.crear` pero con `appointments.actualizar`: BLOQUEADO (BLQ-04). |

### 6.2 Por HU (41 HU derivadas del código)

| HU | Casos | Cobertura |
|---|---|---|
| HU-00.1 Iniciar sesión | AUTH-01..05, AUD-01/09 | Cubierta (API); "recordarme"/pantalla: BLOQUEADO |
| HU-00.2 Centro de trabajo | DASH-03/04, PAT-04e/f (alcance por centros en API) | Parcial: la selección es de interfaz (sessionStorage), sin navegador |
| HU-00.3 Sesión | SES-01..04, USR-12b | CA-02/03/04/05/07 cubiertos; CA-01/06/08 (interceptor, aviso de 5 min, guard) solo por spec |
| HU-01.1 Usuarios del personal | USR-01/02/10/14/20/21, FOTO-* | Parcial: no se probó edición de datos ni cambio de centros del usuario |
| HU-01.2 Roles | ROLE-01..04 | Cubierta (MJ-07) |
| HU-01.3 Permisos de un rol | ROLE-05..08 | Parcial: asignación masiva ya probada en el QA del 2026-10-02, no repetida; MJ-09 BLOQUEADO |
| HU-01.4 Acciones y menús | MENU-01/02, AUD-08 | Parcial: CRUD de acciones/menús no repetido |
| HU-01.5 Usuarios de sistema | USR-03 | Mínima (solo mínimo de contraseña) |
| HU-01.6 Restablecer contraseña | USR-11..14, RST-01 | CA-01..05, 07 cubiertos; CA-06 (sin `role.actualizar`) BLOQUEADO; CA-02 UI BLOQUEADO |
| HU-02.1 Centros médicos | MC-01/02, DOC-10/11 | Parcial: CRUD básico y fotos no repetidos |
| HU-02.2 Departamentos | DEP-01..09 | Cubierta |
| HU-02.3 Asignar médicos a centros | DOC-10/11, SCH-05, setup (assign-doctor 201) | Cubierta (retiro con limpieza y 409) |
| HU-03.1 Médicos | DOC-01..14 | Cubierta (CA-01..11) |
| HU-03.2 Horario semanal | SCH-01..15 | Cubierta |
| HU-03.3 Disponibilidad | CAP-07..12, WALK-03, ABU-07..10 | Cubierta; con hallazgos H-02 |
| HU-04.1 Registrar pacientes | PAT-01..03, 05, 08, 10, PAR-* | Cubierta; escritura de personal no médico: H-07 |
| HU-04.2 Buscar y consultar | PAT-04, 06, 09, DASH-03 | Cubierta |
| HU-05.1 Agendar cita | APT-01..20, CAP-01..19, CON-01, WALK-03 | Cubierta; **H-01 (ALTA)**, H-03 |
| HU-05.2 Agenda y listado | WALK-02, DASH-05/07 | Parcial: filtros del listado no probados |
| HU-05.3 Estado de la cita | TR-01..16, CAP-19 | Cubierta |
| HU-06.1 Atender y cerrar consulta | TR-17..23, WALK-04 | Cubierta (UI: BLOQUEADO) |
| HU-06.2 Consultar historia | HIST-01, HIST-08 | Parcial |
| HU-06.3 Mantener historia | HIST-02..12 | Cubierta |
| HU-07.1 Emitir receta | REC-04..09, TR-19 | Cubierta |
| HU-07.2 Gestionar/imprimir receta | REC-01..03, 10..13 | CA-01/02/03/05/07 cubiertos (CA-07 con **H-05**); CA-04 (PDF) y CA-06/08 no ejecutados |
| HU-08.1 Adjuntar estudios | MAM-01..04 | Cubierta |
| HU-08.2 Convertir DICOM | DCM-01, DCM-02 | Parcial: solo barrido (MJ-42); conversión BLOQUEADA |
| HU-08.3 Fotos | FOTO-01..08, DOC-12, PAT-03 | Cubierta |
| HU-09.1 Analizar mamografía | MAM-05..08, MAM-12g, HLT-03 | Cubierta; H-04 |
| HU-09.2 Vista previa | PREV-01..04 | CA-01/02/05 cubiertos; CA-03 (DICOM) y CA-04 (menú en UI) no |
| HU-09.3 Bandeja | MAM-09/09b/09e, WALK-05c | Cubierta (nota: `/inbox` sin parámetro filtra por hoy) |
| HU-09.4 Validar análisis | MAM-10, 11a | Cubierta |
| HU-09.5 Retirar análisis | MAM-12a..g | Cubierta (CA-04 admin 204 no ejecutado) |
| HU-10.1 Panel | DASH-01..07 | Cubierta |
| HU-11.1 Perfil | FOTO-04 | Parcial |
| HU-11.2 Cambiar contraseña | USR-13a..d | Cubierta |
| HU-12.1 Catálogos clínicos | PAR-* | Mínima (lectura del enfermero) |
| HU-12.2 Catálogos públicos | CAT-01 | Mínima |
| HU-13.1 Registro de errores | — | No cubierta (sin caso) |
| HU-13.2 Colas y salud | HLT-01..04 | Salud cubierta; Bull Board no |
| HU-13.3 Bitácora | AUD-01..13 | CA-02/04/05/06/07/08 cubiertos; CA-01 y CA-03 (fila de lectura propia, ausencia de fila por login correcto) no verificados directamente |

## 7. Lo que no se pudo probar

- **Interfaz real** (sin navegador): selector de turnos visual, avisos de cita cerrada, redirección por `mustChangePassword`, sidebar con las 3 entradas nuevas, "recordarme". Solo se verificaron specs (153/153), el bundle servido y la API.
- **MJ-09** (atomicidad de la matriz de permisos): requiere inyectar un fallo.
- **MJ-40**: bloqueada por diseño (sin casos etiquetados).
- **Conversión DICOM real** y TTL horario (solo el barrido de arranque).
- **Alcance de escritura del personal no médico** sobre pacientes (el rol no tiene los permisos; H-07).
- **HU-01.6 CA-06**, **finish-consultation sin `medical-history.crear`**: exigen un rol a medida que no existe en el ambiente.
- **Carrera del cupo diario** por separado y **carreras** de otras escrituras (cancelar/finalizar dos veces en paralelo, análisis duplicado simultáneo).
- **Login con 6 caracteres** (legado) y restablecimiento con sesión de interfaz abierta.
- **HU-13.1** (registro de errores), **Bull Board**, filtros de listados de citas, CRUD de acciones/menús/centros (ya probados en el QA 2026-10-02, no repetidos).
- **Impresión de receta (PDF)**: es del navegador.
- Rendimiento y carga sostenida; el limitador global (100 req/min por IP) condiciona cualquier prueba de volumen.

## 8. Limpieza

Se ejecutó `cleanup.sql` en una transacción y se comprobó: `medical_appointments` 321 (= inicio), 0 personas `QA%`, 0 usuarios `qa_%`, 0 departamentos `QA%`, 0 roles `qa_rol_*`, 0 imágenes de médico para `cmendoza`. Quedaron huérfanos de bajo impacto: imágenes de análisis en `uploads/mammography-analyses/` de los análisis QA, filas de `auditoria.access_log` (append-only, útiles como evidencia), secuencias consumidas (`APT-`, `PAC-`, `CONS-`, `REC-`) y sesiones Redis de los usuarios `qa_*` (caducan solas). La carpeta `dicom-conversions/qa-new` se borró; `qa-old` fue eliminada por el propio barrido (DCM-01).

```sql
-- Limpieza de fixtures del QA 2026-10-04 (bloque de mejoras). Idempotente. En una transaccion.
-- Alcance: personas con documento 'QA%', usuarios 'qa_%', sus pacientes/medicos/citas y dependientes,
-- departamentos y centro 'QA ...', roles 'qa_rol_tmp'/'qa_rol_audit', y la foto de cmendoza subida en DOC-12b.
BEGIN;
CREATE TEMP TABLE qa_persons AS SELECT id FROM persona_comun WHERE documento LIKE 'QA%';
CREATE TEMP TABLE qa_patients AS SELECT id FROM patients WHERE common_person_id IN (SELECT id FROM qa_persons);
CREATE TEMP TABLE qa_doctors AS SELECT id FROM doctors WHERE common_person_id IN (SELECT id FROM qa_persons);
CREATE TEMP TABLE qa_appts AS SELECT id FROM medical_appointments
  WHERE patient_id IN (SELECT id FROM qa_patients) OR doctor_id IN (SELECT id FROM qa_doctors);
CREATE TEMP TABLE qa_users AS SELECT id FROM public.users WHERE name LIKE 'qa\_%' OR common_person_id IN (SELECT id FROM qa_persons);

DELETE FROM mammography_analyses WHERE appointment_id IN (SELECT id FROM qa_appts) OR patient_id IN (SELECT id FROM qa_patients);
DELETE FROM appointment_files WHERE appointment_id IN (SELECT id FROM qa_appts) OR patient_id IN (SELECT id FROM qa_patients);
DELETE FROM recipe_items WHERE recipe_id IN (SELECT id FROM recipes WHERE medical_appointment_id IN (SELECT id FROM qa_appts) OR patient_id IN (SELECT id FROM qa_patients));
DELETE FROM recipes WHERE medical_appointment_id IN (SELECT id FROM qa_appts) OR patient_id IN (SELECT id FROM qa_patients);
DELETE FROM medical_histories WHERE medical_appointment_id IN (SELECT id FROM qa_appts) OR patient_id IN (SELECT id FROM qa_patients);
DELETE FROM medical_appointments WHERE id IN (SELECT id FROM qa_appts);
DELETE FROM common_person_images WHERE common_person_id IN (SELECT id FROM qa_persons);
DELETE FROM patient_allergies WHERE patient_id IN (SELECT id FROM qa_patients);
DELETE FROM patient_chronic_diseases WHERE patient_id IN (SELECT id FROM qa_patients);
DELETE FROM patient_medications WHERE patient_id IN (SELECT id FROM qa_patients);
DELETE FROM patients WHERE id IN (SELECT id FROM qa_patients);
DELETE FROM doctor_schedules WHERE doctor_id IN (SELECT id FROM qa_doctors);
DELETE FROM doctors_specialties WHERE doctor_id IN (SELECT id FROM qa_doctors);
DELETE FROM medical_centers_doctors WHERE doctor_id IN (SELECT id FROM qa_doctors);
DELETE FROM departments_doctors WHERE doctor_id IN (SELECT id FROM qa_doctors);
DELETE FROM doctor_images WHERE doctor_id IN (SELECT id FROM qa_doctors)
  OR id = '21b2ca60-f93f-4269-8131-b3672c44f656';  -- foto de cmendoza subida en DOC-12b
DELETE FROM doctors WHERE id IN (SELECT id FROM qa_doctors);
DELETE FROM users_medical_centers WHERE user_id IN (SELECT id FROM qa_users);
DELETE FROM public.users WHERE id IN (SELECT id FROM qa_users);
DELETE FROM seguridad.users WHERE id IN (SELECT id FROM qa_users);
DELETE FROM persona_comun WHERE id IN (SELECT id FROM qa_persons);
DELETE FROM parametro.department_specialties WHERE department_id IN (SELECT id FROM parametro.departments WHERE name LIKE 'QA Depto%');
DELETE FROM parametro.departments WHERE name LIKE 'QA Depto%';
DELETE FROM parametro.medical_centers WHERE name = 'QA Centro 409';
DELETE FROM seguridad.permisos_menus WHERE rol_id IN (SELECT id FROM seguridad.roles WHERE nombre IN ('qa_rol_tmp','qa_rol_audit'));
DELETE FROM seguridad.roles WHERE nombre IN ('qa_rol_tmp','qa_rol_audit');
COMMIT;
```

Archivos en disco: `docker exec medos-backend sh -c "cd /app/uploads; rm -rf profile-photos/<id usuario qa> common-persons/<id persona qa> doctors/<id médico demo>/<archivo QA>"` y las carpetas de las citas QA bajo `uploads/<usuario>/<centro>/<cita>`.

## 9. Re-test (2026-10-04)

Tras los commits `8ac4d94` (H-01), `fbdaab1` (H-02, H-03, H-06), `f111ecf` (H-04) de `api-gestion-medica` y `d8a15e2` de `app-gestion-medica` (H-05). Los 9 FAIL de la matriz se repitieron con peticiones reales contra el backend reconstruido.

**Ambiente.** `docker compose -f tesis/docker-compose.yml up -d --build backend` (`medos-backend` `healthy`; `/app/dist` contiene `pg_advisory_xact_lock` y `neutralizeLabels`). `npx jest --ci` **620/620** (79 suites; antes 592). `migration:generate --dryrun --check`: "No changes in database schema were found". Script de datos `docs/info/migrations/2026-10-04-raw-response-etiquetas-neutras.sql` corrido (24 filas: 19 BENIGN, 5 MALIGNANT; verificaciones 0/0/0) y repetido (0 filas). Un solo login de `admin.caracas` (`isSystemUser:false`) por corrida; peticiones espaciadas 0,8 s y 11,5 s entre ráfagas (throttler 20 req/10 s). **Fixture** (insertada por SQL, sin tocar médicos demo): médico `QA9000001` en Centro Clínico Ávila con bloque lunes 08:00–12:00 (30 min, **1 paciente por turno**, cupo 20) y martes 08:00–12:00 (30 min, 5 por turno, **cupo diario 1**). Cada hilo crea su propio paciente (`newPatientData`, documentos `QA76…`/`QA77…`).

### 9.1 H-01 · carrera de capacidad (CON-01) — **PASS 12/12**

6 hilos paralelos por ráfaga, `POST /medical-appointments` con el mismo cuerpo que en §5 salvo el documento. `filas` = `SELECT count(*) FROM medical_appointments WHERE doctor_id=… AND appointment_date::date=… AND status<>'cancelled'`.

| Ráfaga | Día (local) | Qué compite | Códigos | Filas activas en BD |
|---|---|---|---|---|
| CON-01.1 | lun 2026-12-07 08:00 | 6 al mismo turno (cap. 1) | 201 ×1, 400 ×5 | **1** |
| CON-01.2 | lun 2026-12-14 08:00 | ídem | 201 ×1, 400 ×5 | **1** |
| CON-01.3 | lun 2026-12-21 08:00 | ídem | 201 ×1, 400 ×5 | **1** |
| CON-01.4 | lun 2026-12-28 08:00 | ídem | 201 ×1, 400 ×5 | **1** |
| CON-01.5 | lun 2027-01-04 08:00 | ídem | 201 ×1, 400 ×5 | **1** |
| CON-01.6 | lun 2027-01-18 08:00 | ídem (corrida extra para capturar el mensaje) | 201 ×1, 400 ×5 | **1** |
| CON-02.1 | mar 2026-12-08 08:00…10:30 | 6 a **turnos distintos** de un día con cupo 1 | 201 ×1, 400 ×5 | **1** |
| CON-02.2 | mar 2026-12-15 | ídem | 201 ×1, 400 ×5 | **1** |
| CON-02.3 | mar 2026-12-22 | ídem | 201 ×1, 400 ×5 | **1** |
| CON-02.4 | mar 2026-12-29 | ídem | 201 ×1, 400 ×5 | **1** |
| CON-02.5 | mar 2027-01-05 | ídem | 201 ×1, 400 ×5 | **1** |
| CON-02.6 | mar 2027-01-12 | ídem (corrida extra) | 201 ×1, 400 ×5 | **1** |

Mensajes de los 400 (únicos por ráfaga): `El turno de las 08:00 ya está completo: admite 1 paciente(s) y tiene 1.` (CON-01) y `El doctor ya alcanzó el máximo de 1 citas para este día en este centro médico.` (CON-02). Ningún 500 ni 429. BD por día tras las 12 ráfagas (`GROUP BY appointment_date::date`): 1 cita activa en cada uno de los 12 días (`APT-2026-00376`…`00388`, sin huecos duplicados); `appointment_number` duplicados en toda la tabla: 0. Antes del arreglo (§5): hasta 6 citas por turno.

### 9.2 Resto de casos

| Caso | Hallazgo | Request | Esperado | Obtenido | Resultado |
|---|---|---|---|---|---|
| ABU-07 | H-02 | `GET /medical-appointments/availability?doctorId=zzz&date=2026-12-22&medicalCenterId=<Ávila>` | 400 | 400 `["doctorId debe ser un UUID."]` | **PASS** |
| ABU-08 | H-02 | `…availability?doctorId=<uuid>&date=22-12-2026&medicalCenterId=<Ávila>` | 400 (antes 200 con grilla vacía) | 400 `["date debe tener el formato YYYY-MM-DD."]` | **PASS** |
| ABU-11 | H-02 | `…availability?doctorId=<uuid>&date=basura&medicalCenterId=<Ávila>` | 400 | 400 `["date debe tener el formato YYYY-MM-DD."]` | **PASS** |
| ABU-12 | H-02 | `GET …/available-dates?doctorId=zzz&medicalCenterId=<Ávila>&startDate=2026-12-01&endDate=2026-12-14` | 400 | 400 `["doctorId debe ser un UUID."]` | **PASS** |
| ABU-11b | H-02 | `…availability?doctorId=<uuid>&date=2026-12-22&medicalCenterId=zzz` | 400 | 400 `["medicalCenterId debe ser un UUID."]` | **PASS** |
| ABU-14 | H-02 (control) | `…availability?doctorId=<uuid>&date=2026-12-21&medicalCenterId=<Ávila>` | 200 | 200 | **PASS** |
| CAP-17 | H-03 | `PATCH /medical-appointments/<id>` `{"appointmentDate":"2027-01-11T15:30:00.000Z","medicalCenterId":"11111111-1111-4111-8111-111111111111"}` | 404 | 404 `Centro médico con ID 11111111-1111-4111-8111-111111111111 no encontrado.` | **PASS** |
| CAP-17b | H-03 (control) | ídem con `medicalCenterId` = Unidad Médica Guaparo (real, médico no asignado) | 400 | 400 `El médico no está asignado a este centro médico.` | **PASS** |
| ABU-04 | H-06 | `POST /medical-appointments` con `reason` de 501 caracteres | 400 | 400 `["El motivo de la cita no puede superar 500 caracteres."]` | **PASS** |
| ABU-04b | H-06 | `POST` con `observations` de 2001 | 400 | 400 `["Las observaciones no pueden superar 2000 caracteres."]` | **PASS** |
| ABU-04c | H-06 | `PATCH /medical-appointments/<id>/cancel` con `cancellationReason` de 501 | 400 | 400 `["El motivo de cancelación no puede superar 500 caracteres."]` | **PASS** |
| ABU-04d | H-06 (límite) | ídem con 500 caracteres | 200 | 200 (cita cancelada) | **PASS** |
| ABU-04e | MJ-25 | Las dos `POST` rechazadas por longitud (documento `QA7800002`) | 0 personas creadas | `SELECT count(*) FROM persona_comun WHERE documento='QA7800002'` → 0 | **PASS** |
| MAM-13 | H-04 | SQL `raw_response::text ILIKE '%bi-rads%'` | 0 | **0** (antes 24) | **PASS** |
| MAM-13b | H-04 | `GET /mammography-analyses/08127e07-935c-4961-bbce-548548b51de0` (admin) | 200 sin "BI-RADS" | 200; 0 ocurrencias; `rawResponse.raw.label` = `Sospechoso de malignidad` | **PASS** |
| MAM-13c | H-04 | `GET /mammography-analyses/recent?dateFrom=2026-06-01&dateTo=2026-06-30&limit=50` | 0 etiquetas con "BI-RADS" | 200, 37 ítems; 0 en `label`/`rawResponse`; **8 ocurrencias en `reviewNotes`** ("BI-RADS 4C", "BI-RADS 3"): texto libre de la médica, excluido en H-04 | **PASS** |
| REC-10 | H-05 | HU-07.2 RN-08/CA-07 reescritas (400 por campo fijo, MJ-28; `app` `d8a15e2`) | HU = comportamiento | Coinciden | **PASS** |

H-07 se mantiene como observación de cobertura (sin cambio de código; motivo en `docs/tasks/2026-10-04-005-bloque-mejoras.md`).

### 9.3 Limpieza y veredicto

`cleanup.sql` (personas `QA%` con sus pacientes, médico, horario, centro y citas) en una transacción: `medical_appointments` **321** (= inicio), 0 personas / pacientes / médicos `QA%`, 0 horarios huérfanos, 0 citas `QA re-test` restantes. Quedan, como en §8, filas append-only de `auditoria.access_log` y secuencias consumidas (`APT-2026-00376…00388`, `PAC-`).

**Veredicto actualizado:** matriz **394 PASS · 0 FAIL · 10 BLOQUEADO** (los 10 BLOQUEADO de §1 no cambian: interfaz, DICOM real, roles inexistentes). H-01 (ALTA) cerrado con 12/12 ráfagas serializadas; H-02, H-03, H-04 y H-06 cerrados; H-05 corregido en la HU; H-07 documentado. **El bloque queda apto para cierre.**
