-- =============================================================================
-- 2026-09-25 — Depuración del grupo duplicado en persona_comun (M-18, paso 1)
-- =============================================================================
-- Qué hace:
--   Corrige el documento de UNA de las dos personas que comparten (letra, documento)
--   para que el índice único parcial UQ_persona_comun_documento_activo se pueda crear.
--   MUEVE DATOS: cambia persona_comun.documento (y opcionalmente letra) de una fila.
-- Estado: EJECUTADO el 2026-09-25 en bd_gestion_medica con persona_id=d53ebb57-acd5-4786-986d-6436f62df52c, letra=V, documento=990000001 (datos de prueba).
--   Datos al 2026-09-25: 7a662859-0c03-4d4e-9271-0d5e57d7cebd (usuario medico + doctor + paciente con
--   22 citas, 17 historias, 2 recetas, 24 mamografías) y d53ebb57-acd5-4786-986d-6436f62df52c (usuario
--   medico + doctor, sin actividad clínica). Nombres, teléfono, email, licencia y centro difieren:
--   son dos personas distintas con el mismo documento, así que NO se fusionan; se corrige el documento.
-- Precondiciones:
--   - Respaldo previo: pg_dump -Fc.
--   - Conocer el documento correcto de la persona elegida (dato del negocio, no se puede inferir).
--   - Ejecutar con: psql -v persona_id=<uuid> -v letra=<V|E|...> -v documento=<nuevo> -f <este archivo>
-- Idempotente: sí (el UPDATE fija valores; repetirlo no cambia nada más).
-- Transacción: sí (BEGIN/COMMIT). Aborta si el nuevo documento ya existe en otra persona activa.
-- Orden: 1) este script; 2) npm run migration:run (aplica 1790399000000-PersonaComunUniqueDocument, que aborta si quedan duplicados).
-- =============================================================================

\set ON_ERROR_STOP on

-- Verificación ANTES (esperado hoy: 1 grupo)
SELECT letra, count(*) AS personas
FROM persona_comun
WHERE documento IS NOT NULL AND deleted_at IS NULL
GROUP BY letra, documento
HAVING count(*) > 1;

BEGIN;

-- psql no interpola variables dentro de DO $$ … $$: la guarda usa \gset + \if.
SELECT count(*) = 0 AS documento_libre
FROM persona_comun
WHERE letra = :'letra' AND documento = :'documento' AND deleted_at IS NULL
  AND id <> :'persona_id'::uuid \gset

\if :documento_libre
UPDATE persona_comun
SET letra = :'letra', documento = :'documento', updated_at = now()
WHERE id = :'persona_id'::uuid;
COMMIT;
\else
\echo 'El documento nuevo ya pertenece a otra persona activa: no se cambió nada.'
ROLLBACK;
\quit
\endif

-- Verificación DESPUÉS (esperado: 0 filas)
SELECT letra, count(*) AS personas
FROM persona_comun
WHERE documento IS NOT NULL AND deleted_at IS NULL
GROUP BY letra, documento
HAVING count(*) > 1;
