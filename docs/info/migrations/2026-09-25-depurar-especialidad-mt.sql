-- =============================================================================
-- 2026-09-25 — Depuración del código de especialidad duplicado 'MT' (M-19)
-- =============================================================================
-- Qué hace:
--   Cambia el `code` de UNA de las dos especialidades con code = 'MT' para que se
--   pueda crear el índice único UQ_specialties_code_active.
--   MUEVE DATOS: actualiza parametro.specialties.code de una fila. No toca
--   doctores, departamentos, citas ni historias (referencian por id, no por código).
-- Estado: NO EJECUTADO. Requiere decisión de producto (qué fila cambia y a qué código).
--   Datos al 2026-09-25 (ids y conteos):
--     a0c83b33-8003-4731-9411-e4891be7e88b  "Medicina del Trabajo"  0 doctores, 0 departamentos, 0 citas, 0 historias
--     fc6618f2-a886-4396-a269-6cc4792daa59  "mastología"            3 doctores, 1 departamento, 15 citas, 14 historias
--   'MT' es la sigla natural de Medicina del Trabajo; propuesta: recodificar mastología (p. ej. 'MS', hoy libre).
-- Precondiciones:
--   - Respaldo previo: pg_dump -Fc.
--   - Ejecutar con: psql -v specialty_id=<uuid> -v nuevo_codigo=<código> -f <este archivo>
-- Idempotente: sí (fija el valor; repetirlo no cambia nada más).
-- Transacción: sí (BEGIN/COMMIT). Aborta si el código nuevo ya está en uso.
-- Orden: 1) este script; 2) mover src/database/migrations-pending/1790399100000-SpecialtiesUniqueCodeAndName.ts
--   a src/database/migrations y declarar los índices en Specialty; 3) npm run migration:run.
--   Independiente de la depuración de persona_comun (M-18).
-- =============================================================================

\set ON_ERROR_STOP on

-- Verificación ANTES (esperado hoy: MT | 2)
SELECT code, count(*) FROM parametro.specialties
WHERE deleted_at IS NULL GROUP BY code HAVING count(*) > 1;

BEGIN;

SELECT count(*) = 0 AS codigo_libre
FROM parametro.specialties
WHERE code = :'nuevo_codigo' AND deleted_at IS NULL AND id <> :'specialty_id'::uuid \gset

\if :codigo_libre
UPDATE parametro.specialties
SET code = :'nuevo_codigo', updated_at = now()
WHERE id = :'specialty_id'::uuid;
COMMIT;
\else
\echo 'El código nuevo ya está en uso: no se cambió nada.'
ROLLBACK;
\quit
\endif

-- Verificación DESPUÉS (esperado: 0 filas en ambas)
SELECT code, count(*) FROM parametro.specialties
WHERE deleted_at IS NULL GROUP BY code HAVING count(*) > 1;
SELECT lower(name), count(*) FROM parametro.specialties
WHERE deleted_at IS NULL GROUP BY 1 HAVING count(*) > 1;
