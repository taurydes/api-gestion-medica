-- =============================================================================
-- 2026-10-04 — Citas `completed` sin historia clínica → `cancelled`
-- -----------------------------------------------------------------------------
-- Qué hace:     MUEVE DATOS. Pasa a `cancelled`, con motivo, las citas `completed`
--               vivas que no tienen historia clínica viva. Son 7 citas de prueba
--               de feb–mar 2026 (APT-2026-00001 a 00007; médicos ysleidy, jean y
--               daniel; motivos sin contenido clínico), cerradas antes de que
--               `completed` exigiera el cierre de consulta (MJ-26) y antes de
--               retirar PATCH /:id/complete. Ninguna tiene receta ni archivos.
-- Por qué así:  inventar una historia clínica para ellas fabricaría un registro
--               médico; `cancelled` es un estado final coherente con "no hubo
--               consulta registrada" y no aparece como atención en la demo.
-- Precondición: api en `dt/modules` con be94683 (sin /complete) desplegado.
-- Idempotente:  sí (solo toca `completed` sin historia viva; una 2.ª corrida
--               actualiza 0 filas).
-- Transacción:  sí (BEGIN/COMMIT abajo).
-- Orden:        independiente de las migraciones TypeORM; correr una vez.
-- =============================================================================

-- Verificación previa: debe listar las citas que se van a mover (7 al 2026-10-04).
SELECT a.appointment_number, a.status, a.appointment_date
  FROM medical_appointments a
 WHERE a.deleted_at IS NULL
   AND a.status = 'completed'
   AND NOT EXISTS (SELECT 1 FROM medical_histories h
                    WHERE h.medical_appointment_id = a.id AND h.deleted_at IS NULL);

BEGIN;

UPDATE medical_appointments a
   SET status = 'cancelled',
       cancellation_reason = 'Cerrada sin consulta registrada (dato de prueba anterior a la regla de cierre).',
       updated_at = now()
 WHERE a.deleted_at IS NULL
   AND a.status = 'completed'
   AND NOT EXISTS (SELECT 1 FROM medical_histories h
                    WHERE h.medical_appointment_id = a.id AND h.deleted_at IS NULL);

COMMIT;

-- Verificación posterior 1: ninguna cita completada sin historia (esperado: 0).
SELECT count(*) AS completadas_sin_historia
  FROM medical_appointments a
 WHERE a.deleted_at IS NULL
   AND a.status = 'completed'
   AND NOT EXISTS (SELECT 1 FROM medical_histories h
                    WHERE h.medical_appointment_id = a.id AND h.deleted_at IS NULL);

-- Verificación posterior 2: las movidas quedan canceladas con el motivo (esperado: 7).
SELECT count(*) AS canceladas_por_script
  FROM medical_appointments
 WHERE status = 'cancelled'
   AND cancellation_reason = 'Cerrada sin consulta registrada (dato de prueba anterior a la regla de cierre).';
