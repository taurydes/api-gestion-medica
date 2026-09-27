-- =============================================================================
-- 2026-09-26 — Backfill de malignancy_probability y raw_score (M-40)
-- -----------------------------------------------------------------------------
-- Qué hace:     MUEVE DATOS. Rellena malignancy_probability y raw_score de los
--               análisis guardados antes de la predicción en el servidor (M-39),
--               que solo tienen `probability` (confianza en la clase predicha).
--               Lógica de main.py de esa época (p = sigmoide, umbral 0,15):
--                 MALIGNANT: probability = (1 - p) * 100 -> malignancy = probability
--                 BENIGN:    probability = p * 100       -> malignancy = 100 - probability
--                 raw_score = 1 - malignancy / 100 (= p)
-- Fuente real:  la migración TypeORM 1790473400000-BackfillMammographyMalignancy
--               (este archivo es la referencia legible + verificación).
-- Precondición: migración 1790473312991-MammographyMalignancyColumns aplicada.
-- Idempotente:  sí (solo toca filas con malignancy_probability y model_version NULL).
-- Transacción:  sí (BEGIN/COMMIT abajo; TypeORM también la envuelve).
-- Orden:        después de 1790473312991; antes de cualquier recálculo por M-44.
-- Precisión:    probability es numeric(5,2) -> raw_score con error <= 5e-5.
-- =============================================================================

BEGIN;

UPDATE mammography_analyses
   SET malignancy_probability = CASE WHEN prediction = 'MALIGNANT'
                                     THEN probability ELSE 100 - probability END,
       raw_score = 1 - (CASE WHEN prediction = 'MALIGNANT'
                             THEN probability ELSE 100 - probability END) / 100.0
 WHERE malignancy_probability IS NULL
   AND model_version IS NULL
   AND prediction IN ('MALIGNANT', 'BENIGN');

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación (resultado del 2026-09-26: 25 | 25 | 5 | 5 | 0 | 0)
-- -----------------------------------------------------------------------------
SELECT count(*)                                                   AS filas,
       count(malignancy_probability)                              AS rellenas,
       count(*) FILTER (WHERE status = 'danger')                  AS malignas,
       count(*) FILTER (WHERE malignancy_probability >= 80)       AS high_risk,
       count(*) FILTER (WHERE malignancy_probability >= 80
                          AND prediction = 'BENIGN')              AS benignas_en_min80,
       count(*) FILTER (WHERE (prediction = 'MALIGNANT' AND malignancy_probability < 85)
                           OR (prediction = 'BENIGN'    AND malignancy_probability > 85)) AS incoherentes_con_umbral
  FROM mammography_analyses
 WHERE deleted_at IS NULL;
