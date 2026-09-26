-- =============================================================================
-- 2026-09-25 — Baseline de la migración inicial (M-13)
-- =============================================================================
-- Qué hace:
--   Marca la migración `InitialSchema1790384118206` como aplicada en una base
--   que YA tiene el esquema (creado antes por synchronize()). No crea tablas.
--   Crea la tabla `public.migrations` de TypeORM si no existe e inserta la fila.
-- Precondiciones:
--   - Respaldo previo: pg_dump -Fc.
--   - El esquema actual coincide con las entidades: `npm run migration:generate`
--     contra esta base responde "No changes in database schema were found".
--   - NO correr en una base vacía: ahí se usa `npm run migration:run`.
-- Idempotente: sí (CREATE TABLE IF NOT EXISTS + INSERT ... WHERE NOT EXISTS).
-- Transacción: sí (BEGIN/COMMIT).
-- Orden: primero de todos. Después: `npm run migration:run` aplica las
--   migraciones posteriores a la inicial.
-- Mueve datos: no (solo agrega una fila de control).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.migrations (
    id SERIAL NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL,
    CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id)
);

INSERT INTO public.migrations ("timestamp", name)
SELECT 1790384118206, 'InitialSchema1790384118206'
WHERE NOT EXISTS (
    SELECT 1 FROM public.migrations WHERE name = 'InitialSchema1790384118206'
);

COMMIT;

-- Verificación (esperado: 1 fila; `npm run migration:show` marca [X] InitialSchema):
-- SELECT id, "timestamp", name FROM public.migrations ORDER BY id;
