-- =============================================================================
-- 2026-09-25-sanear-error-log.sql
-- -----------------------------------------------------------------------------
-- Qué hace:
--   Sanea auditoria.error_log (M-07). MUEVE DATOS: reescribe filas existentes.
--   1. headers: elimina las claves authorization, proxy-authorization, cookie,
--      set-cookie, token, x-access-token, x-refresh-token y x-api-key, y
--      enmascara ?token=... dentro de referer.
--   2. request_body, request_query y context: enmascara con '******' el valor de
--      toda clave cuyo nombre contenga pass/password, token, secret,
--      authorization, cookie o apikey, a cualquier profundidad.
--   3. route y context.referer: enmascara parámetros sensibles de la query string.
--   Aplica el mismo criterio que src/logs/log-sanitizer.util.ts.
--
-- Precondiciones:
--   - El backend ya corre con el saneamiento de M-07 (si no, siguen entrando
--     filas con credenciales mientras se ejecuta el script).
--   - Respaldo previo: pg_dump -Fc -t auditoria.error_log bd_gestion_medica > error_log_pre_m07.dump
--   - Los tokens que ya quedaron guardados siguen siendo válidos mientras la
--     sesión exista: este script no los invalida. Se invalidan rotando
--     JWT_SECRET (M-01) o borrando session:* en Redis.
--
-- Idempotente: sí. Una segunda ejecución no encuentra nada que cambiar
--   (las consultas de verificación "después" deben dar 0 y el UPDATE, 0 filas).
-- Transacción: sí, todo el script va dentro de BEGIN ... COMMIT. Si la
--   verificación "después" no da 0, reemplazar COMMIT por ROLLBACK.
-- Orden: independiente de otros scripts. Correrlo después de desplegar M-07.
-- Funciones: crea funciones en pg_temp (se borran al cerrar la sesión).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VERIFICACIÓN ANTES (anotar los valores)
-- -----------------------------------------------------------------------------
SELECT
  count(*)                                                                  AS total_filas,
  count(*) FILTER (WHERE headers::text ~* 'bearer')                         AS headers_con_bearer,
  count(*) FILTER (WHERE headers ?| ARRAY['authorization','proxy-authorization','cookie','set-cookie','token','x-access-token','x-refresh-token','x-api-key'])
                                                                            AS headers_con_claves_sensibles,
  count(*) FILTER (WHERE request_body::text ~* '"password"')                AS body_con_clave_password,
  count(*) FILTER (WHERE request_body::text ~* '"[^"]*(pass|token|secret|authorization|cookie|api[-_]?key)[^"]*"\s*:\s*"(?!\*{6}")')
                                                                            AS body_con_valor_sensible_sin_mascara,
  count(*) FILTER (WHERE route ~* '[?&][^=&]*(pass|token|secret)[^=&]*=(?!\*{6})')
                                                                            AS route_con_query_sensible
FROM auditoria.error_log;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.mask_jsonb(j jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text;
  v jsonb;
  result jsonb;
BEGIN
  IF j IS NULL THEN
    RETURN NULL;
  ELSIF jsonb_typeof(j) = 'object' THEN
    result := '{}'::jsonb;
    FOR k, v IN SELECT key, value FROM jsonb_each(j) LOOP
      IF k ~* '(pass|token|secret|authorization|cookie|api[-_]?key)' THEN
        result := result || jsonb_build_object(k, '******');
      ELSE
        result := result || jsonb_build_object(k, pg_temp.mask_jsonb(v));
      END IF;
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(j) = 'array' THEN
    SELECT coalesce(jsonb_agg(pg_temp.mask_jsonb(e) ORDER BY ord), '[]'::jsonb)
      INTO result
      FROM jsonb_array_elements(j) WITH ORDINALITY AS t(e, ord);
    RETURN result;
  ELSE
    RETURN j;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.mask_query(url text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    url,
    '([?&][^=&]*(pass|token|secret)[^=&]*=)[^&#]*',
    '\1******',
    'gi'
  );
$$;

UPDATE auditoria.error_log
SET
  headers = CASE
    WHEN headers IS NULL THEN NULL
    WHEN headers ? 'referer' THEN
      jsonb_set(
        headers - ARRAY['authorization','proxy-authorization','cookie','set-cookie','token','x-access-token','x-refresh-token','x-api-key'],
        '{referer}',
        to_jsonb(pg_temp.mask_query(headers->>'referer'))
      )
    ELSE headers - ARRAY['authorization','proxy-authorization','cookie','set-cookie','token','x-access-token','x-refresh-token','x-api-key']
  END,
  request_body  = pg_temp.mask_jsonb(request_body),
  request_query = pg_temp.mask_jsonb(request_query),
  context = CASE
    WHEN context ? 'referer' AND jsonb_typeof(context->'referer') = 'string' THEN
      jsonb_set(pg_temp.mask_jsonb(context), '{referer}', to_jsonb(pg_temp.mask_query(context->>'referer')))
    ELSE pg_temp.mask_jsonb(context)
  END,
  route = pg_temp.mask_query(route)
WHERE headers ?| ARRAY['authorization','proxy-authorization','cookie','set-cookie','token','x-access-token','x-refresh-token','x-api-key']
   OR headers->>'referer' ~* '[?&][^=&]*(pass|token|secret)[^=&]*=(?!\*{6})'
   OR request_body  IS DISTINCT FROM pg_temp.mask_jsonb(request_body)
   OR request_query IS DISTINCT FROM pg_temp.mask_jsonb(request_query)
   OR context       IS DISTINCT FROM pg_temp.mask_jsonb(context)
   OR route ~* '[?&][^=&]*(pass|token|secret)[^=&]*=(?!\*{6})';

-- -----------------------------------------------------------------------------
-- VERIFICACIÓN DESPUÉS (dentro de la transacción): todas las columnas deben dar 0
-- salvo total_filas (igual al "antes") y body_con_clave_password (la clave
-- queda, con valor '******').
-- -----------------------------------------------------------------------------
SELECT
  count(*)                                                                  AS total_filas,
  count(*) FILTER (WHERE headers::text ~* 'bearer')                         AS headers_con_bearer,
  count(*) FILTER (WHERE headers ?| ARRAY['authorization','proxy-authorization','cookie','set-cookie','token','x-access-token','x-refresh-token','x-api-key'])
                                                                            AS headers_con_claves_sensibles,
  count(*) FILTER (WHERE request_body::text ~* '"password"')                AS body_con_clave_password,
  count(*) FILTER (WHERE request_body::text ~* '"[^"]*(pass|token|secret|authorization|cookie|api[-_]?key)[^"]*"\s*:\s*"(?!\*{6}")')
                                                                            AS body_con_valor_sensible_sin_mascara,
  count(*) FILTER (WHERE route ~* '[?&][^=&]*(pass|token|secret)[^=&]*=(?!\*{6})')
                                                                            AS route_con_query_sensible,
  count(*) FILTER (WHERE headers::text ~ 'eyJ[A-Za-z0-9_-]+\.')             AS jwt_en_headers
FROM auditoria.error_log;

COMMIT;
