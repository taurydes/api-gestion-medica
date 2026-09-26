# 2026-09-25-004 — Correcciones del QA de Fases 0 y 1

## Qué se pidió

Corregir los hallazgos de `docs/QA/2026-09-25-fases-0-1-qa.md`: H-01 (ALTA, un superusuario con doctor vinculado recibe resultados de médico), H-02 (MEDIA, 500 con el mensaje crudo de Postgres en `appointment-files`) y H-03 (BAJA, login exitoso con rol inactivo). Después, re-test contra el contenedor reconstruido.

## Qué se hizo

- **H-01**: una sola regla, `AuthContextService.getScopedDoctorId` (admin = `security.consultar` → sin filtro). Se reemplazaron los helpers privados `getDoctorIdForUser` de `patient`, `recipe` y `medical-history`, que no tenían exención; de `medical-appointments`, donde `findByPatient` y `getDoctorSchedule` no la tenían; y de `doctors` y `medical-center`, que la tenían inline. En las ramas que ya comprueban `isAdmin` porque también deciden el alcance de paciente (`medical-appointments.findAll`, `assertFindOneAccess`) se usa `authContextService.getDoctorIdForUser`, para no repetir la consulta de permisos.
- **H-02**: pipe compartido `src/common/pipes/parse-uuid.pipe.ts` en los ids de BD de `files` y `mammography-analyses`. `HttpExceptionFilter` devuelve "Error interno del servidor." para las excepciones no HTTP; el detalle sigue yendo a `auditoria.error_log`.
- **H-03**: `validateUser`/`validateSystemUser` cargan `role` y rechazan un rol ausente, inactivo o borrado con el mismo mensaje que un usuario inactivo. `refreshTokens` hace lo mismo y borra la sesión. El tipo `AuthUser.user` excluye `role` para que no entre al JWT.

## Decisiones

- Un rol ausente también se rechaza: `UserAccessService.resolve` devuelve `null` si no hay rol, y `SessionGuard` ya rechazaba ese token. Verificado antes del cambio: 0 usuarios activos sin rol o con rol inactivo.
- El helper de specs vive en `test/auth-context-stub.ts` (fuera de `src`) porque usa `jest`, y `tsconfig.build.json` solo excluye `*spec.ts` y `test/`.
- Los repos `User`/`Doctor` inyectados en `patient`/`recipe`/`medical-history` ya no los usa el filtro. Se dejaron para no cambiar la firma de DI más de lo necesario.

## Verificación

- `npm run build` 0/0; `npx jest` 29 suites / **147 tests** verdes (nuevo baseline; antes 133).
- Re-test HTTP + BD + Redis en la sección 10 del reporte QA: todo PASS.

## Fuera de alcance / pendiente

- `patient.findOne` y `doctors.findOne` envuelven el error crudo en `NotFoundException(error.message)`, así que un id no UUID devuelve 404 con el texto del driver. Es el patrón M-61, para Fase 2.
- Un médico común que pide un paciente borrado sin citas con él sigue recibiendo 403, porque el filtro corre antes del 404. Aceptado: no revela nada nuevo.
