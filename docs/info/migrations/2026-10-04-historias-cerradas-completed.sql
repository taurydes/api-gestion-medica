-- =============================================================================
-- 2026-10-04 — Historias de consultas cerradas pasan a 'completed' (MJ-50)
-- -----------------------------------------------------------------------------
-- Qué hace:     MUEVE DATOS. El cierre de consulta creaba la historia en
--               'in_progress' aunque la cita quedaba 'completed'; desde el
--               commit api 84d7605 la crea 'completed'. Las historias ya creadas
--               así (224 al 2026-10-04, todas de citas 'completed') se alinean.
--               Efecto: PATCH /medical-history/:id sobre ellas responde 400,
--               igual que sobre cualquier historia cerrada (la interfaz no edita
--               historias).
-- Precondición: ninguna (solo datos).
-- Idempotente:  sí (una 2.ª corrida actualiza 0 filas).
-- Transacción:  sí (BEGIN/COMMIT abajo).
-- Orden:        independiente de las migraciones TypeORM; correr una vez.
-- =============================================================================

-- Verificación previa: historias vivas en curso cuya cita ya está completada (224 al 2026-10-04).
SELECT count(*) AS en_curso_con_cita_cerrada
  FROM medical_histories h JOIN medical_appointments a ON a.id = h.medical_appointment_id
 WHERE h.deleted_at IS NULL AND h.status = 'in_progress' AND a.status = 'completed';

BEGIN;

UPDATE medical_histories h SET status = 'completed', updated_at = now()
  FROM medical_appointments a
 WHERE a.id = h.medical_appointment_id
   AND h.deleted_at IS NULL AND h.status = 'in_progress' AND a.status = 'completed';

COMMIT;

-- Verificación posterior (esperado: 0).
SELECT count(*) AS pendientes
  FROM medical_histories h JOIN medical_appointments a ON a.id = h.medical_appointment_id
 WHERE h.deleted_at IS NULL AND h.status = 'in_progress' AND a.status = 'completed';
