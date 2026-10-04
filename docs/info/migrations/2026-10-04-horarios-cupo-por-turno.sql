-- =============================================================================
-- 2026-10-04 — Cupo por turno coherente en los horarios (MJ-19)
-- -----------------------------------------------------------------------------
-- Qué hace:     MUEVE DATOS. Desde api 12ae3dd, max_patients_per_slot se aplica
--               al agendar. Los 14 bloques de los médicos de prueba `daniel` y
--               `julio` (feb–mar 2026) tenían 10 pacientes por turno de 30 min,
--               valor que no corresponde a un médico; se llevan a 1, como el
--               resto (los médicos demo ya tienen 30 min / 1 paciente).
--               También verifica que no haya bloques solapados del mismo médico
--               y día (regla nueva de 4a10e09); al 2026-10-04 había 0.
-- Precondición: ninguna (solo datos).
-- Idempotente:  sí (una 2.ª corrida actualiza 0 filas).
-- Transacción:  sí (BEGIN/COMMIT abajo).
-- Orden:        independiente de las migraciones TypeORM; correr una vez.
-- =============================================================================

-- Verificación previa: bloques vivos con más de un paciente por turno (14 al 2026-10-04).
SELECT s.id, s.doctor_id, s.day_of_week, s.start_time, s.end_time, s.max_patients_per_slot
  FROM doctor_schedules s
 WHERE s.deleted_at IS NULL AND s.max_patients_per_slot > 1;

BEGIN;

UPDATE doctor_schedules
   SET max_patients_per_slot = 1, updated_at = now()
 WHERE deleted_at IS NULL AND max_patients_per_slot > 1;

COMMIT;

-- Verificación posterior 1: ningún bloque con más de un paciente por turno (esperado: 0).
SELECT count(*) AS bloques_con_cupo_multiple
  FROM doctor_schedules
 WHERE deleted_at IS NULL AND max_patients_per_slot > 1;

-- Verificación posterior 2: bloques solapados del mismo médico y día, en cualquier centro (esperado: 0).
SELECT count(*) AS pares_solapados
  FROM doctor_schedules a
  JOIN doctor_schedules b
    ON b.doctor_id = a.doctor_id AND b.day_of_week = a.day_of_week AND b.id > a.id
   AND b.deleted_at IS NULL AND a.deleted_at IS NULL
   AND b.start_time < a.end_time AND a.start_time < b.end_time;
