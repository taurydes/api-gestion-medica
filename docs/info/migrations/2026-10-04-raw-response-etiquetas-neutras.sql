-- =============================================================================
-- 2026-10-04 — Etiquetas neutras dentro de la respuesta cruda anidada (MJ-36, QA H-04)
-- -----------------------------------------------------------------------------
-- Qué hace:     MUEVE DATOS. El script 2026-10-04-analisis-etiquetas-neutras.sql
--               alineó `label` y `raw_response->>'label'`, pero la respuesta del
--               detector se guarda anidada en `raw_response->'raw'`, y ese
--               `raw.label` conservaba el texto legado ("Neoplasia Maligna
--               (BI-RADS 4/5)" / "Hallazgos Benignos (BI-RADS 1/2)") que
--               GET /mammography-analyses/:id devolvía. Reescribe ese valor
--               según `prediction` en las 24 filas afectadas (22 vivas, 2
--               borradas; creadas 2026-06-09..16). La API además lo mapea al
--               leer (neutral-labels.ts) como red de seguridad.
-- Precondición: ninguna (solo datos). Correr después del script anterior.
-- Idempotente:  sí (una 2.ª corrida actualiza 0 filas).
-- Transacción:  sí (BEGIN/COMMIT abajo).
-- Orden:        independiente de las migraciones TypeORM; correr una vez.
-- =============================================================================

-- Verificación previa: filas con BI-RADS en cualquier parte del JSON (24 al 2026-10-04).
SELECT raw_response->'raw'->>'label' AS raw_label, prediction, count(*)
  FROM mammography_analyses
 WHERE raw_response::text ILIKE '%bi-rads%'
 GROUP BY 1, 2;

BEGIN;

UPDATE mammography_analyses
   SET raw_response = jsonb_set(raw_response, '{raw,label}',
         to_jsonb(CASE prediction WHEN 'MALIGNANT' THEN 'Sospechoso de malignidad' ELSE 'No sospechoso' END))
 WHERE raw_response->'raw'->>'label' ILIKE '%bi-rads%'
   AND prediction IN ('MALIGNANT', 'BENIGN');

COMMIT;

-- Verificación posterior (esperado: 0 en ambas).
SELECT count(*) AS raw_anidado_con_bi_rads FROM mammography_analyses WHERE raw_response->'raw'->>'label' ILIKE '%bi-rads%';
SELECT count(*) AS json_con_bi_rads FROM mammography_analyses WHERE raw_response::text ILIKE '%bi-rads%';
-- Coherencia etiqueta anidada / clase (esperado: 0).
SELECT count(*) AS incoherentes FROM mammography_analyses
 WHERE raw_response->'raw' ? 'label'
   AND ((prediction = 'MALIGNANT' AND raw_response->'raw'->>'label' <> 'Sospechoso de malignidad')
     OR (prediction = 'BENIGN' AND raw_response->'raw'->>'label' <> 'No sospechoso'));
