# 2026-09-25-002 — Fase 0 del plan de mejoras: seguridad

## Qué se pidió

- Implementar la Fase 0 del plan `app-gestion-medica/docs/plans/2026-09-25-plan-mejoras.md` en el backend (rama `dt/modules`): M-51 (Jest), M-02, M-03, M-31 (backend) + M-04, M-05, M-06, M-07, M-08, M-09, M-10 y M-11.
- Cada ítem con un test unitario que invoque el servicio, guard o controlador real con repositorios simulados.
- Restricciones: sin commit, push ni reescritura de historia; sin SQL que modifique `bd_gestion_medica`; sin cambios en entidades TypeORM; `sdfsdf` queda borrado (lo borró el usuario).
- Fuera de alcance: M-01 (rotar secretos y purgar historia, lo hace el usuario) y M-12.

## Línea base

- `npx jest --ci`: 8 de 8 suites fallan al compilar (TS2593/TS2304), 0 tests.
- `npm run build`: 0 errores, 0 advertencias.
- `npm run lint`: no está verde en la base. Un archivo sin tocar como `src/health/health.controller.ts` da 42 errores (casi todos `prettier` por CRLF). Además el script usa `--fix` y reescribiría todo el repo, así que no se ejecutó.

## Qué se hizo, por ítem

| Ítem | Estado | Qué se hizo |
|---|---|---|
| M-51 | Hecho | `tsconfig.spec.json` (agrega `jest` a `types`), `ts-jest` apunta a él y `moduleNameMapper` para `src/…` en `package.json`; `test/jest-e2e.json` nuevo (`npm run test:e2e` arranca, 0 tests). `tsconfig.json` sin cambios: `nest build` no ve los tipos de Jest. Tras compilar, las 8 specs de plantilla fallaban por DI; se les agregó `.useMocker(() => ({}))` (siguen siendo "should be defined") |
| M-02 | Hecho | Sin fallbacks: `'secret'` (`auth.module.ts`, `jwt.strategy.ts`), `'default_jwt_key'` (`JwtExternal.guard.ts`), `JWTKEY_VALIDATOR` como secreto alternativo (`jwt-auth.guard.ts`, `logs.controller.ts`), `'default_key'` (`encryption.adapter.ts`), `DB_PASS '123456'` y `EMAIL_PASS 'clave'`. Joi exige `JWT_REFRESH_SECRET`, `ENCRYPT_KEY` (mín. 16) y `DB_PASS`. `.env` tiene las tres claves (verificado por presencia, sin imprimir valores). `JwtModule` pasa a `registerAsync` con `ConfigService` |
| M-03 | Hecho | Bull Board se monta **una sola vez** en `main.ts` detrás de `PanelAccessService.middleware` (JWT + sesión Redis + permiso `bullboard.consultar` leído de la BD). Se quitaron las rutas `queues`/`queues/*` del controlador y su segundo `ExpressAdapter`. `ModuleItemsMenu.BullBoardModule` pasa de `'bull-board'` a `'bullboard'` (el slug real). El superusuario (`seguridad.users`) entra |
| M-31 (back) | Hecho | `PATCH /auth/change-password` (bcrypt compare, 400 si la actual no coincide) y `PATCH /auth/me` (id del JWT; solo `email` + `commonPerson`; sin permiso de módulo) en `ProfileController`/`ProfileService` dentro de `UserModule` |
| M-04 | Hecho | `UpdateUserDto` rechaza `password` con 400. `roleId` solo cambia con `role.actualizar`; `status` solo con `user.eliminar`. Reenviar el mismo valor no exige permiso. `status: false` cierra la sesión. `/users-security` pasa a exigir `user-security.*` (usaba `user.*`: un médico con `user.actualizar` podía cambiar la contraseña del admin de sistema) |
| M-05 | Hecho | Login (`users` y `seguridad.users`) filtra `deletedAt IS NULL AND status = true`. Refresh rechaza usuario borrado o inactivo y borra su sesión. `user.remove` y `userSecurity.remove` borran `session:{id}`. `PermissionsGuard` exige usuario y rol activos (`roles.activo`, `deleted_at`) |
| M-06 | Hecho | Se retiró `ServeStaticModule`. Las URLs devueltas apuntan a endpoints con guard. Nuevo `GET /files/dicom-conversions/:sessionId/:filename` para los frames DICOM. El 404 de `/uploads/...` ya no muestra la ruta absoluta |
| M-07 | Hecho | `log-sanitizer.util.ts`: quita `authorization`, `cookie`, `token` y afines de los headers, enmascara claves sensibles a cualquier profundidad en body/query/context y `?token=` en ruta y referer. Script `docs/info/migrations/2026-09-25-sanear-error-log.sql` (no ejecutado) |
| M-08 | Hecho | `upload-path.util.ts`: `resolveUploadPath` (contención en `uploads/`), `assertSafeFileName`, `assertFolderId` (UUID o `general`). Aplicado a todas las lecturas y escrituras de `files` y a `mammography-analyses/:id/image` |
| M-09 | Hecho | `SpecialtyController` → `parameters.*`; `POST /recipes` → `recipe.crear`; `GET /logs` y `/logs/ui/api` → `logs.consultar` (el guard lee el rol de la BD); `/logs/ui/view` sin `?token=` (lee la cookie) y con el mismo chequeo; `dicom-convert` → `file.crear` |
| M-10 | Hecho | Los 4 endpoints de `/dashboard` exigen `appointments.consultar`. Alcance: admin todo, doctor sus citas, resto nada. Comentario corregido |
| M-11 | Hecho | Admin por permiso (`security.consultar`) en `doctors`, `medical-appointments` y `medical-center` vía `AuthContextService.isAdmin`. Filtro por médico en `GET /patient/:id`, `GET /recipes/medical-history/:id` y todo `mammography-analyses` (bandeja, ranking, stats, por cita, detalle, imagen, revisar) |

## Decisiones

| Decisión | Motivo |
|---|---|
| Permiso para cambiar `roleId`: `role.actualizar`; para `status`: `user.eliminar` | En `seguridad.permisos_menus` solo `superusuario` los tiene. Desactivar equivale a dar de baja. `medico` y `enfermero` tienen `user.actualizar`, pero no estos dos |
| Admin con alcance global = permiso `security.consultar` | `security` es el menú padre de Usuarios, Roles y Permisos y solo `superusuario` tiene filas en él. Con los datos actuales el conjunto de admins es el mismo que con la subcadena del nombre. Un flag de rol requeriría cambiar la entidad (fuera de esta fase) |
| Bull Board y vista de logs exigen un permiso (`bullboard.consultar`, `logs.consultar`) en vez de comparar `roleName` | H14: el JWT no trae `roleName`; el rol se resuelve desde la BD. Ambos slugs existen y solo `superusuario` los tiene |
| Dashboard con `appointments.consultar` | No existe un slug `dashboard` en `seguridad.menu`. El tablero muestra citas; `medico` y `superusuario` lo tienen. `enfermero` pasa a recibir 403 (hoy no hay usuarios con ese rol) |
| Especialidades con `parameters.*` | Es el módulo de los otros catálogos del mismo controlador (`medications`, `allergies`, `chronic-diseases`). No existe un slug `specialty` |
| `PATCH /auth/me` y `/auth/change-password` viven en `UserModule` con `@Controller('auth')` | Importar `UserModule` desde `AuthModule` arma un ciclo (`AuthModule → UserModule → RoleModule → PermissionModule → AuthModule`) |
| `password` en `UpdateUserDto` declarado con `@IsEmpty` | Con `whitelist` se habría descartado en silencio: el formulario de admin creería que cambió la contraseña |
| Contraseña actual incorrecta → 400, no 401 | El `errorInterceptor` del frontend refresca o cierra la sesión ante un 401 |
| No se invalidan "otras sesiones" al cambiar la contraseña | El modelo es de sesión única por usuario (`session:{id}` guarda un solo token); un login nuevo ya invalida el anterior |
| Filtro por médico de `patient.findOne` y `recipes/medical-history` sin exención de admin; mamografías con exención | Se copió el criterio del listado de cada módulo (`patient.findAll` y `recipe.findByPatient` no eximen admins; citas sí). Cambiar el listado queda fuera de alcance |
| Recetas por historial: se filtra después de la caché | La invalidación existente borra la clave por historial; una clave por médico no se invalidaría |
| `uploadFile` y `download-url` devuelven `url: null` | No hay endpoint protegido para archivos genéricos; son restos de plantilla (H19) y el frontend no los usa |
| `update` de usuario propaga las `HttpException` | Antes convertía todo en 400, incluido el 403 nuevo. Efecto lateral: usuario inexistente pasa de 400 a 404 |
| `PERMISSIONS_SECRET` conserva su fallback | El frontend descifra `modules` con la misma clave fija (H15); quitarla rompe `/auth/me` hasta M-38/M-60 |
| No se cambiaron los alias `UPLOAD/ASSIGN/DIAGNOSTICAR = 'crear'` ni se agregó "denegar por defecto" | Requiere sembrar permisos nuevos o marcar ~180 rutas; hoy solo `superusuario` tiene `permission.crear`, así que `assign-all` no está expuesto a otros roles |

## Cómo se verificó

- **Tests:** 18 suites, **81 tests, todos verdes** (antes 0 ejecutados). Ninguno lee el fuente ni reimplementa lógica; todos instancian el servicio, guard o controlador real. Mutaciones de control: al quitar el chequeo de `roleId`, la contención de `resolveUploadPath`, el filtro de login y `sanitizeHeaders`, fallan 5 tests; se restauró el código.
- **Build:** `npm run build` 0 errores, 0 advertencias. `npm run test:e2e` arranca (sin tests).
- **Lint:** los archivos nuevos que no son specs pasan ESLint sin errores (regla `prettier` desactivada por el CRLF de la base). En las specs, ESLint marca `jest` como tipo error porque usa `tsconfig.json`; es la misma condición de la base.
- **BD (solo lectura):** slugs y permisos por rol en `seguridad.menu`/`permisos_menus`; 16 usuarios, 0 borrados o inactivos (el filtro de login no deja afuera a nadie); los 114 `file_path`/`image_path` guardados están dentro de `uploads/` y con carpetas UUID; 0 filas guardan URLs `/uploads/`.
- **Script M-07:** la verificación "antes" corre sobre la base: 668 filas, 573 con `Bearer` en headers, 575 con claves sensibles, 58 con la clave `password` (todas **ya enmascaradas** en primer nivel: 0 con valor sin máscara). Las funciones `pg_temp` se probaron en una transacción con `ROLLBACK`, solo sobre literales y un `SELECT`; ninguna tabla se modificó. El `UPDATE` no se ejecutó.
- **Arranque local (PORT=8020):** 187 rutas, sin advertencias `LegacyRouteConverter`. `pg_dump --schema-only` antes y después: **idéntico** (`synchronize()` sin cambios). Conteo de filas de las 41 tablas: igual salvo `auditoria.error_log` +15 (los errores provocados por las pruebas).
- **Pruebas sin autenticación (curl):**

| Petición | Resultado |
|---|---|
| `GET /admin/queues`, `GET /admin/queues/api/queues`, `PUT …/retry/failed` | 401 JSON (antes 200) |
| `GET /admin/queues` con `Accept: text/html` | 302 a `/admin/login` |
| `GET /uploads/qa-probe/probe.jpg` (archivo creado y borrado para la prueba) | 404 |
| `GET /uploads/no-existe.jpg` | 404 `"Cannot GET /uploads/no-existe.jpg"`, sin ruta absoluta |
| `GET /files/profile-photos/..%2F..%2F/.env` y variantes | 403 antes del servicio (la contención se prueba en los tests) |
| `GET /logs/ui/view?token=abc` | 302 al login (el `?token` se ignora) |
| `POST /auth/login` con `Authorization: Bearer …`, cookie y `password` en el body (400) | fila nueva sin `authorization`, sin `cookie` y con `password`/`refreshToken` en `******` |

- **No verificado:** las pruebas autenticadas (médico → 403 al cambiar rol, login de un usuario borrado de punta a punta, superusuario en Bull Board) porque no hay credenciales de prueba. Se cubren con tests de servicio.

## Qué quedó fuera

- M-01 (rotación de secretos y purga de `sdfsdf` del historial) y M-12.
- Endpoint para que un admin fije la contraseña de otro usuario: `PATCH /users/:id` ya no lo permite. Hay que decidir si se agrega (p. ej. `PATCH /users/:id/password` con `user-security.actualizar`).
- `GET /patient/by-document` sin filtro por médico: se usa para citar pacientes nuevos y filtrarlo rompería ese flujo.
- `update` de usuario: la escritura de `users` y la de `persona_comun` siguen sin transacción (previo; M-14/M-25).
- `UpdateUserDto.commonPerson` no tiene `@ValidateNested`: acepta cualquier campo de `persona_comun`. Agregarlo descartaría `phoneNumber` (M-32).
- Los tokens ya guardados en `error_log` siguen siendo válidos mientras exista su sesión: hace falta M-01 o borrar `session:*`.

## Pendiente para otros

- **Usuario:** rotar `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DB_PASS`, `EMAIL_PASS`, `TOKEN_VALIDATOR` y `REDIS_SESSION_PASS`, y purgar `sdfsdf` del historial (M-01). Correr el script de M-07 después de desplegar y tras un `pg_dump -Fc`.
- **Frontend:** checklist de `docs/info/2026-09-25-fase-0-integracion-frontend.md` (perfil, formulario de usuario, 3 componentes con `<img [src]>` directo y el 403 del dashboard).
- **Commits:** ver "División de commits propuesta" al final (B1–B11). No se hizo ningún commit.

## Ronda de correcciones 1 (revisión 4R)

Hallazgos CRITICAL verificados por el refutador, más dos del lente de resiliencia.

| Hallazgo | Problema | Corrección |
|---|---|---|
| C-01 | `PATCH /users-security/:id` aplicaba `roleId`/`status` sin el chequeo de `PATCH /users/:id` | Regla extraída a `src/user/user-admin-fields.ts` (`resolveAdminFieldChanges`) y usada por los dos servicios: solo si el valor cambia, mismos 403 y mismos permisos (`role.actualizar`, `user.eliminar`). El controlador reenvía `req.userPermissions`. Las constantes se reexportan desde `user.service.ts` |
| C-02 | `UserSecurityService.remove` borraba y después revocaba; un fallo de Redis salía como 404 con el borrado ya hecho y la sesión viva | Revoca primero (`revokeSessionOrFail`) y después borra. Si Redis falla: 503 `No se pudo cerrar la sesión del usuario. Intente nuevamente.` y la fila queda intacta |
| C-03 | `UserService.remove` revocaba fuera de la transacción: 500 tras el commit y sesión viva hasta 3600 s. `SessionGuard` solo miraba Redis y las rutas sin `@Permission` aceptaban el token | (a) La revocación va dentro de la transacción, antes del `commit`; si falla hay `rollback` y 503. (b) `SessionGuard` llama a `UserAccessService.resolve` (cubre `users` y `seguridad.users`) y responde 401 `Sesión inválida: usuario inactivo o eliminado` si el usuario no existe, está borrado o inactivo, o su rol está inactivo. Deja el acceso en `req.userAccess` y `PermissionsGuard` lo reutiliza: una sola consulta por request |
| R4-003 | `status: false` en los dos `update` escribía y después revocaba; un fallo de Redis dejaba el cambio persistido con error | La revocación va antes de cualquier escritura; si falla, 503 y nada escrito |
| R4-004 | El 500 de `PanelAccessService.middleware` y el `catch` de `/logs/ui/view` no dejaban rastro | `Logger.error` solo para errores que no son `HttpException`. Sin cambio de respuesta |

Decisiones de esta ronda:

| Decisión | Motivo |
|---|---|
| Revocar antes de escribir, no después | Si Redis falla no queda nada escrito y el 503 se puede reintentar. Si falla la BD después de revocar, el usuario solo tiene que volver a iniciar sesión: falla hacia el lado seguro |
| 401 (no 403) en `SessionGuard` para usuario inactivo o borrado | Es una sesión que ya no vale; el frontend ya cierra la sesión ante un 401 |
| Rol inactivo también da 401 en todas las rutas | `resolve().isActive` incluye el rol. Antes solo daba 403 en rutas con `@Permission` |
| `UserSecurityService.update` propaga las `HttpException` | Necesario para el 403. Mismo efecto lateral que en `users`: usuario inexistente pasa de 400 a 404 |
| `remove` solo deja pasar el 503; el resto sigue como 404 | Conserva los mensajes existentes; convertir todo el `catch` queda fuera de alcance |
| `PermissionModule` importa `CommonModule` | `CaslPermissionController` usa `@UseGuards(JwtAuthGuard, SessionGuard)` y el guard ahora necesita `UserAccessService` en ese módulo |

Verificación:

- **Tests:** 20 suites, **99 tests verdes** (baseline anterior 81; +18). Nuevos: `src/user/user-security.service.spec.ts` (9), `src/auth/guards/session.guard.spec.ts` (6) y 3 netos en `src/user/user.service.spec.ts` (2 de `update`; en `remove` el test existente pasó a verificar el orden y se sumó el de fallo de Redis). Todos instancian el servicio, guard o controlador real con repositorios y Redis simulados.
- **Mutaciones:** se revirtió cada corrección por separado y se restauró. Sin la regla en `users-security`: 3 fallan. Borrar antes de revocar: 2. Revocar tras el commit: 2. `SessionGuard` sin chequeo de usuario: 3. Revocar tras escribir en `users`: 2; en `users-security`: 2. Controlador sin reenviar permisos: 1.
- **Build:** `npm run build` 0 errores, 0 advertencias. `tsc -p tsconfig.spec.json --noEmit` limpio.
- **No verificado:** de punta a punta con Redis caído; se cubre con los tests de servicio.

## División de commits propuesta

Sin commit. Medir cada paso con `git diff --cached --stat -- ':!**/Migrations'`. Los archivos compartidos por varios ítems (`main.ts`, `app.module.ts`, `logs.controller.ts`, `user.service.ts`) se parten con `git add -p`. Cada commit debe compilar y pasar la suite.

| # | Commit | Contenido |
|---|---|---|
| B1 | `test: make jest suite compile and run` | M-51: `package.json` (jest), `tsconfig.spec.json`, `test/jest-e2e.json`, `.useMocker` en las specs de plantilla |
| B2 | `fix(config): remove hardcoded secret fallbacks` | M-02: `auth.module.ts`, `jwt.strategy.ts`, `JwtExternal.guard.ts`, `jwt-auth.guard.ts`, `encryption.adapter.ts`, `configuration.ts`, `validation.ts` |
| B3 | `feat(auth): resolve role and status from db in guards` | M-05 (guard) + C-03b: `user-access.service.ts`, `common.module.ts`, `permission.guard.ts` + spec, `session.guard.ts` + spec, `permission.module.ts` (import de `CommonModule`) |
| B4 | `fix(auth): reject deleted or inactive users on login and refresh` | M-05 (login/refresh): `auth.service.ts` + spec |
| B5 | `fix(auth): protect bull board and logs view behind panel access` | M-03 + parte de M-09: `panel-access.service.ts` + spec (con el `Logger.error` de R4-004), `main.ts`, `bull-board.controller.ts`, `menu.const.ts`, `/logs/ui/*` en `logs.controller.ts` (con R4-004), vistas `.hbs` |
| B6 | `fix(users): gate role and status changes and revoke sessions atomically` | M-04 + C-01 + C-02 + C-03a + R4-003: `update-user.dto.ts`, `user-admin-fields.ts`, `user.service.ts` + spec, `user-security.service.ts` + spec, `user-security.controller.ts`, `user.controller.ts` |
| B7 | `feat(users): add self profile and change password endpoints` | M-31: `profile.controller.ts`, `profile.service.ts` + spec, `change-password.dto.ts`, `update-profile.dto.ts`, `user.module.ts` |
| B8 | `fix(files): serve uploads only through guarded endpoints` | M-06 + M-08: `app.module.ts` (sin `ServeStaticModule`), `files.*` + specs, `upload-path.util.ts`, `dicom-converter.service.ts`, imagen de `mammography-analysis` |
| B9 | `fix(logs): sanitize sensitive data before persisting error logs` | M-07: `log-sanitizer.util.ts`, `logs.service.ts` + spec, `logs.module.ts` (el SQL vive en `docs/`, fuera del repo) |
| B10 | `fix(permissions): align endpoint permissions with business modules` | M-09 + M-10: `specialty.controller.ts`, `recipe.controller.ts`, `@Permission` de `/logs`, `dashboard.*` + spec |
| B11 | `fix(scope): filter clinical data by doctor unless admin` | M-11: `auth-context.service.ts` + spec, `doctors`, `medical-appointments`, `medical-center`, `patient` + specs, `recipe` + spec, `mammography-analysis` + spec |

Dependencias: B3 antes de B5 (ambos usan `UserAccessService`) y de B11 (`AuthContextService.isAdmin`). B6 es independiente de B3, pero la defensa completa de C-03 necesita los dos.
