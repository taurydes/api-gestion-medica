-- =============================================================================
-- 2026-10-04 — Etiquetas neutras en los análisis guardados (MJ-36)
-- -----------------------------------------------------------------------------
-- Qué hace:     MUEVE DATOS. mammography_analyses.label guardaba el texto del
--               detector ("Neoplasia Maligna (BI-RADS 4/5)" / "Hallazgos
--               Benignos (BI-RADS 1/2)"), que sugiere una categoría BI-RADS que
--               el modelo no asigna. Desde api 5b70052 la API guarda
--               "Sospechoso de malignidad" / "No sospechoso" según prediction;
--               este script alinea los 94 análisis anteriores (al 2026-10-04).
--               Paso 2: raw_response->>'label' (la respuesta cruda del detector,
--               que GET /mammography-analyses/:id devuelve) también se alinea;
--               desde detector 564458b el detector ya responde las etiquetas neutras.
-- Precondición: ninguna (solo datos).
-- Idempotente:  sí (una 2.ª corrida actualiza 0 filas).
-- Transacción:  sí (BEGIN/COMMIT abajo).
-- Orden:        independiente de las migraciones TypeORM; correr una vez.
-- =============================================================================

-- Verificación previa: etiquetas con BI-RADS (94 al 2026-10-04).
SELECT label, prediction, count(*) FROM mammography_analyses WHERE label LIKE '%BI-RADS%' GROUP BY 1, 2;

BEGIN;

UPDATE mammography_analyses
   SET label = CASE prediction WHEN 'MALIGNANT' THEN 'Sospechoso de malignidad' ELSE 'No sospechoso' END
 WHERE label LIKE '%BI-RADS%' AND prediction IN ('MALIGNANT', 'BENIGN');

UPDATE mammography_analyses
   SET raw_response = jsonb_set(raw_response, '{label}',
         to_jsonb(CASE prediction WHEN 'MALIGNANT' THEN 'Sospechoso de malignidad' ELSE 'No sospechoso' END))
 WHERE raw_response->>'label' LIKE '%BI-RADS%' AND prediction IN ('MALIGNANT', 'BENIGN');

COMMIT;

-- Verificación posterior 0: respuestas crudas con BI-RADS (esperado: 0).
SELECT count(*) AS raw_con_bi_rads FROM mammography_analyses WHERE raw_response->>'label' LIKE '%BI-RADS%';

-- Verificación posterior (esperado: 0).
SELECT count(*) AS con_bi_rads FROM mammography_analyses WHERE label LIKE '%BI-RADS%';
-- Coherencia etiqueta / clase (esperado: 0).
SELECT count(*) AS incoherentes FROM mammography_analyses
 WHERE (prediction = 'MALIGNANT' AND label <> 'Sospechoso de malignidad')
    OR (prediction = 'BENIGN' AND label <> 'No sospechoso');
