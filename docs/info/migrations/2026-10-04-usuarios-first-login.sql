-- =============================================================================
-- 2026-10-04 — first_login sin uso previo pasa a false (MJ-05)
-- -----------------------------------------------------------------------------
-- Qué hace:     MUEVE DATOS. Hasta api c712418 la columna users.first_login no
--               tenía efecto: nadie la leía. Desde ese commit (y 87efbb3) significa "debe
--               cambiar la contraseña al entrar" (/auth/me la expone como
--               mustChangePassword y el restablecimiento por administrador la
--               pone en true). 18 cuentas de prueba la tenían en true por el
--               formulario antiguo; se ponen en false para que la regla nueva
--               no les exija un cambio que nadie pidió.
-- Precondición: correr ANTES de que el frontend aplique mustChangePassword.
-- Idempotente:  sí (una 2.ª corrida actualiza 0 filas).
-- Transacción:  sí (BEGIN/COMMIT abajo).
-- Orden:        independiente de las migraciones TypeORM; correr una vez.
-- =============================================================================

-- Verificación previa: cuentas vivas con first_login = true (18 al 2026-10-04).
SELECT id, name, first_login FROM public.users WHERE deleted_at IS NULL AND first_login;

BEGIN;

UPDATE public.users SET first_login = false, updated_at = now()
 WHERE deleted_at IS NULL AND first_login;

COMMIT;

-- Verificación posterior (esperado: 0).
SELECT count(*) AS pendientes FROM public.users WHERE deleted_at IS NULL AND first_login;
