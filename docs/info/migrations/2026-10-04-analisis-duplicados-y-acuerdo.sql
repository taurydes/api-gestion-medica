-- =============================================================================
-- 2026-10-04 — Análisis de mamografía: duplicados por archivo y acuerdo del médico (MJ-44, MJ-33)
-- -----------------------------------------------------------------------------
-- Qué hace:     MUEVE DATOS.
--               1) MJ-44: deja un solo análisis vivo por archivo de cita. Al
--                  2026-10-04 había 3 archivos con 2–3 análisis (7 filas, ninguna
--                  revisada, de pruebas de jun–oct 2026). Se conserva el revisado
--                  y, si no hay, el más reciente; los demás se borran lógicamente
--                  con deletion_reason.
--               2) MJ-33: rellena doctor_agreement desde el texto que el front
--                  guardaba en notes ("Médico: Confirma resultado | …").
--                  review_agreement no se rellena: review_notes es texto libre
--                  sin una forma fija de acuerdo.
-- Precondición: correr DESPUÉS de la migración (api 05dfa51)
--               MammographyAgreementAndSingleAnalysis1790520600000 para el paso 2
--               (crea las columnas). El paso 1 lo repite la migración antes de
--               crear el índice único, así que aquí sale con 0 filas si ya corrió.
-- Idempotente:  sí (una 2.ª corrida actualiza 0 filas en ambos pasos).
-- Transacción:  sí (BEGIN/COMMIT abajo).
-- Orden:        después de la migración indicada; correr una vez.
-- =============================================================================

-- Verificación previa 1: archivos con más de un análisis vivo (esperado tras la migración: 0).
SELECT appointment_file_id, count(*) FROM mammography_analyses
 WHERE appointment_file_id IS NOT NULL AND deleted_at IS NULL
 GROUP BY 1 HAVING count(*) > 1;

-- Verificación previa 2: análisis con acuerdo solo en el texto (20 al 2026-10-04).
SELECT count(*) AS acuerdo_en_texto FROM mammography_analyses
 WHERE deleted_at IS NULL AND doctor_agreement IS NULL AND notes LIKE 'Médico: %';

BEGIN;

UPDATE mammography_analyses a
   SET deleted_at = now(), deletion_reason = 'Duplicado del mismo archivo (MJ-44)'
  FROM (SELECT id, row_number() OVER (PARTITION BY appointment_file_id ORDER BY is_reviewed DESC, created_at DESC) AS rn
          FROM mammography_analyses
         WHERE appointment_file_id IS NOT NULL AND deleted_at IS NULL) d
 WHERE a.id = d.id AND d.rn > 1;

-- "No confirma" antes que "Confirma": el patrón de la segunda está contenido en la primera.
UPDATE mammography_analyses SET doctor_agreement = CASE
         WHEN notes LIKE 'Médico: No confirma resultado%' THEN 'rejected'
         WHEN notes LIKE 'Médico: Confirma resultado%' THEN 'accepted'
         WHEN notes LIKE 'Médico: Incierto%' THEN 'uncertain'
       END
 WHERE deleted_at IS NULL AND doctor_agreement IS NULL
   AND (notes LIKE 'Médico: No confirma resultado%' OR notes LIKE 'Médico: Confirma resultado%' OR notes LIKE 'Médico: Incierto%');

COMMIT;

-- Verificación posterior 1 (esperado: 0 filas).
SELECT appointment_file_id, count(*) FROM mammography_analyses
 WHERE appointment_file_id IS NOT NULL AND deleted_at IS NULL
 GROUP BY 1 HAVING count(*) > 1;

-- Verificación posterior 2 (esperado: 0).
SELECT count(*) AS pendientes FROM mammography_analyses
 WHERE deleted_at IS NULL AND doctor_agreement IS NULL AND notes LIKE 'Médico: %';

-- Reparto del acuerdo (informativo).
SELECT doctor_agreement, count(*) FROM mammography_analyses WHERE deleted_at IS NULL GROUP BY 1;
