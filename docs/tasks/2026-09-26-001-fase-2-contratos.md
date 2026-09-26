# 2026-09-26-001 — Fase 2 del plan de mejoras: contratos frontend ↔ backend (backend)

## Qué se pidió

- Parte backend de la Fase 2 de `app-gestion-medica/docs/plans/2026-09-25-plan-mejoras.md`: M-26 (lado backend), M-27, M-28, M-29, M-32, M-33 (lado backend), M-35 (backend) y M-37 (backend). M-30/M-31 ya estaban hechos en la Fase 0.
- Decisiones de contrato fijadas por el coordinador para que el agente del frontend trabaje en paralelo (no agregar `POST /permissions`; `medico` asignado por nombre; 401/403; `HH:mm(:ss)`; etc.).
- Ampliación a mitad de tarea (hallazgos del agente del frontend): perfil propio sin `user.consultar`, centros de usuarios no médicos, correo del paciente, borrado de permisos sembrados y confirmar los supuestos del frontend.
- Corregir cualquier defecto encontrado. Base de prueba sin respaldo. Esquema y datos solo por migración con `down()`, sin drift.

## Qué se hizo (commits, en orden)

| Commit | Ítem | Resumen |
|---|---|---|
| `263d5f0` | M-29 | `JwtAuthGuard`: sin token → 401 "Token requerido para esta petición"; token inválido → 401. `PermissionsGuard`: sin usuario, usuario sin rol, inactivo o con rol inactivo → 401; 403 solo por permiso. Panel de Bull Board igual. Guards sin uso (`JwtExternal`, `HeaderToken`) alineados |
| `5dea60d` | M-27 | `@IsUUID('all')` en `roleId`, `moduleId`, `permissionId(s)` y `userId` de `CheckPermissionDto`; `@IsNotEmpty` en `menuSlug`/`action`/`module`. Correcciones del servicio (abajo). Retirados los dos endpoints `bulk-assign/user*` |
| `5d4308a` | M-26 | `CreateRoleDto`/`UpdateRoleDto` con `isActive`; no se renombran `superusuario`/`medico`. `UpdatePermissionDto` propio (`displayName`, `isActive`, `order`, `isRequired`, `controlType`; `name` solo igual al actual). Borrado `CreatePermissionDto` (sin uso) |
| `4a9ac25` | M-28 | Migración `1790400000000-SeedCommonPersonMenu`: menú `common-person` (id fijo, oculto) + 4 acciones para `superusuario` |
| `c7d86e6` | M-32, M-35, M-37 | `phoneNumber` en `CreateCommonPersonDto`; `@ValidateNested` en `CreateUserDto.commonPerson`; perfil reutiliza la regla. `observations` en `ConsultationHistoryInputDto`; `quantity` opcional `@IsInt @Min(1)` = 1 (cierre y `POST /recipes`). Horarios `HH:mm(:ss)` normalizados a `HH:mm:ss` |
| `f6646b4` | M-33 | `POST /users`: sin `roleId` y con `doctor` → rol `medico` resuelto por nombre dentro de la transacción; sin rol → 422; sin `doctor` ni `roleId` → 400 |
| `ad1628d` | ampliación 3 | Columna `patients.email` (migración `1790433741509-PatientsEmail`, generada), `email` en `CreatePatientDto` y en `newPatientData` de citas |
| `ba2df71` | ampliación 4 | `crear`/`consultar`/`actualizar`/`eliminar` no se borran ni se desactivan → 409 |
| `9f51385` | ampliación 1 | `GET /auth/profile` (solo sesión) |
| `1f48a8f` | M-35 | Ajuste del test de contrato (el `medicationId` del fixture no era UUID) |

## Defectos encontrados y corregidos en el camino

| Defecto (verificado en el código) | Efecto | Corrección |
|---|---|---|
| `getRolePermissions` usaba `ROLE_PERMISSIONS_KEY(typeof roleId === 'number' ? roleId : 0)`: con ids UUID **todos los roles compartían la clave `…:0:…`** | `/permissions/me`, `/auth/me` y `getUserPermissions` podían devolver los permisos de otro rol mientras durara la entrada de caché; `invalidateRoleCache` nunca la borraba | Clave con `String(roleId)`. Test: dos roles no comparten caché |
| Asignar/revocar buscaba la asignación **sin filtrar `deleted_at`**: con una fila revocada y otra viva, `findOne` podía devolver la revocada | Revocar respondía `true` y el permiso seguía concedido; reactivar chocaba con el índice parcial `UQ_permisos_menus_…_active` | `findGrant` prefiere la fila viva; `revoke` solo mira la viva. Tests con fila vieja + viva |
| `assignPermissionToRole` reactivaba con `isActive = true` pero **dejaba `deleted_at` puesto** | La fila reactivada quedaba fuera del índice parcial y contaba como revocada para cualquier consulta con `deleted_at IS NULL` | `reactivateGrant` limpia `deleted_at` y registra el actor |
| `bulk-assign/user*`: guardaban `rol_id` = rol del usuario y deduplicaban por `user_id` (que en el resto del código es el **actor**) | Asignar "a un usuario" habría dado el permiso a **todo su rol**. Nunca funcionaron: el DTO descartaba `userId` | Endpoints y métodos retirados (el frontend no los usa) |
| `CreateRoleDto.active` / `CreatePermissionDto.active`/`required` no corresponden a ninguna columna (`isActive`, `isRequired`) | Activar/desactivar un rol o permiso desde la UI no hacía nada y respondía 200 | DTOs con los nombres de las columnas |
| `CreateUserDto.commonPerson` sin `@ValidateNested` | El objeto no se validaba ni pasaba por `whitelist`: cualquier campo (`id`, `deletedAt`, …) llegaba a `manager.create(CommonPerson, …)` y a `commonPersonRepository.update` en `PATCH /users/:id` | `@ValidateNested()`. Test: campos ajenos descartados, nombre de 31 caracteres → 400 |
| Horarios: `"12:00" >= "12:00:00"` es `false` como string | Un bloque con inicio igual al fin pasaba la validación al mezclar formatos | Normalización a `HH:mm:ss` antes de comparar. Test |
| `permission.remove` convertía cualquier `HttpException` distinta de 404 en 500 | El 409 nuevo habría salido como 500 | `catch` propaga `HttpException` (también en `update`) |

## Decisiones

| Decisión | Motivo |
|---|---|
| No hay `POST /permissions` | Las acciones son un catálogo fijo que usan todos los `@Permission`; crear una nueva no sirve sin código que la exija. El frontend retira la pantalla |
| `PATCH /permissions/:id` acepta `name` solo igual al actual (400 si cambia) | El frontend siempre envía `name`; rechazar el campo rompería la edición, y renombrar rompe todos los guards |
| Desactivar una acción del sistema también → 409 (no solo borrarla) | Tiene el mismo efecto que borrarla (el guard filtra `permission.isActive`) |
| No renombrar `superusuario`/`medico`; sí cambiar su estado | M-33 y la regla de admin los resuelven por nombre. Desactivar `superusuario` sigue siendo posible (queda como riesgo operativo, no se pidió bloquearlo) |
| Alta de médico sin rol `medico` → **422** | El cliente no puede corregirlo con otro cuerpo salvo enviando `roleId`; 400 sugiere un error de formato |
| `IsUUID('all')` en permisos | Hay ids de fixtures hechos a mano; `ParseUuid` de los params tampoco exige v4 |
| Menú `common-person` oculto (`es_visible = false`), orden 27, id fijo `c0e0e5a1-0000-4000-8000-000000000028` | Es un módulo de API, no una pantalla. El id fijo permite un `down()` que solo borra lo creado. Solo se concede a `superusuario` (dependencia 9 del plan) |
| Perfil propio: **`GET /auth/profile`** y no ampliar `/auth/me` | `/auth/me` ya lleva `modules` cifrado y lo consume el login; un endpoint aparte devuelve la misma forma que `GET /users/:id`, así el frontend solo cambia la URL |
| Correo del paciente en **`patients.email`**, no en `persona_comun` | La persona es compartida con usuarios, que ya tienen `users.email`; dos correos en la misma persona serían ambiguos |
| `phoneNumber`: `^\+?[0-9][0-9\s-]{6,19}$`, máx. 20, `""` → `null` | Cubre los 12 teléfonos existentes (8–13 dígitos, uno con `+`) y lo que escribe una persona (`0414-123 4567`); 20 es el largo de la columna |
| Horas: `([01]\d\|2[0-3]):[0-5]\d(:[0-5]\d)?` en lugar de `\d{2}:\d{2}` | `25:00` pasaba el DTO y fallaba en PostgreSQL con 500 |

## Brecha de modelo (no se inventó esquema)

**Centros de usuarios que no son médicos.** `getUserWithPermissions` resuelve `medicalCenters` solo por el doctor vinculado. En el modelo **no existe relación usuario ↔ centro**: las únicas tablas con `medical_center_id` son `medical_centers_doctors`, `departments`, `doctor_schedules`, `medical_appointments`, `medical_histories` y `medical_center_images` (consulta a `information_schema.columns`). Hoy hay 1 usuario `enfermero` (fixture QA) y 1 `superusuario` sin doctor; los 12 `medico` tienen doctor.

Además, el backend **no acota por centro** a quien no es médico: `assertFindOneAccess` ("No es doctor: puede ver cualquier centro") y `getScopedDoctorId` devuelven alcance global. Opciones para decidir (producto):
1. Tabla `users_medical_centers` + gestión en la UI de usuarios (esquema nuevo, migración, y habría que empezar a filtrar por centro a esos roles).
2. Devolver todos los centros activos a quien no es médico, coherente con la regla de acceso actual (cambia lo que ven los superusuarios con doctor vinculado).
3. Que el frontend no exija centro a los roles sin doctor.

Se documentó en la guía de integración; no se cambió el comportamiento.

## Verificación

| Prueba | Resultado |
|---|---|
| `npm run build` | 0 errores, 0 advertencias |
| `npx jest --ci` | 36 suites, **203 tests** verdes (baseline anterior 151) |
| `migration:run` → `revert` → `run` de las dos migraciones nuevas | OK; `SeedCommonPersonMenu` re-ejecutada a mano dentro de `BEGIN … ROLLBACK`: `INSERT 0` y `INSERT 0` (idempotente) |
| `migration:generate` tras aplicar todo | "No changes in database schema were found" (sin drift) |
| `migration:show` | 13 migraciones aplicadas; arranque del contenedor: "No migrations are pending" |
| Contenedor | `docker compose … up -d --build backend` y smoke con usuarios QA (`qa.superclean`, `qa.enfermero`) |

Tests nuevos (todos invocan el servicio, el guard o el `ValidationPipe` real): `auth/guards/jwt-auth.guard.spec.ts`, casos nuevos en `permission.guard.spec.ts` y `panel-access.service.spec.ts`, `permission/dto/permission-dtos.validation.spec.ts`, `permission/services/permission-grants.spec.ts`, `role/role-permission-update.spec.ts`, `doctors/doctor-contracts.spec.ts`, casos en `finish-consultation.spec.ts`, `user/user-create-role.spec.ts`, casos en `patient-reregister.spec.ts` y `profile.service.spec.ts`.

### Smoke HTTP + BD (contenedor reconstruido, 41/41 PASS)

| Caso | Esperado | Obtenido |
|---|---|---|
| `GET /users` sin token | 401 "Token requerido para esta petición" | 401, mismo mensaje |
| `GET /users` token inválido | 401 | 401 |
| `GET /users` enfermero (sin `user.consultar`) | 403 | 403 |
| `GET /common-persons` superusuario / enfermero | 200 / 403 | 200 / 403 |
| `POST /permissions/assign` UUID → fila activa en BD | 200 + fila | 200 + fila `activo = true` |
| `DELETE /permissions/revoke` UUID → sin fila viva | 200 `success:true` | igual |
| `POST /permissions/bulk-update` enable/disable | 200 + fila reactivada / revocada | igual |
| `roleId: 2` | 400 `roleId debe ser un UUID válido` | igual |
| `POST /permissions/bulk-assign/user` | 404 | 404 |
| `PATCH /permissions/:id` displayName / renombrar | 200 / 400 | 200 / 400 |
| `DELETE` y `PATCH isActive:false` de `consultar` | 409 / 409 | 409 / 409 |
| `POST /permissions` | 404 | 404 |
| `PATCH /roles/:id` `isActive:false` (rol QA) → BD | 200, `activo = false` | igual; restaurado a `true` |
| Renombrar `medico` / `PUT /roles/:id` | 400 / 404 | 400 / 404 |
| `PATCH /menu/:id` (`common-person`) | 200 | 200 |
| `PATCH /doctors/:id` `commonPerson.phoneNumber` → `persona_comun.telefono` | 200 + valor | 200 + `04140000032`; restaurado al original |
| `phoneNumber: "abc"` | 400 | 400 |
| `POST /users` con `doctor` sin `roleId` → rol | 201, `medico` | 201, `medico` |
| `POST /users` sin `doctor` ni `roleId` | 400 | 400 |
| `PATCH /doctors/schedules/:id` `08:00:00`/`12:00:00` / `25:00` | 200 / 400 | 200 / 400 |
| `finish-consultation` con `medicalHistory.observations` y cantidades 2 y (omitida) | 200, `observations` guardado, `quantity` 1 y 2 | igual |
| `GET /auth/profile` enfermero / `GET /users/:id` enfermero | 200 sin `password` / 403 | igual |
| `POST /patient` con `email` → `patients.email` | 201 + valor | igual |

Datos que dejó el smoke (base de prueba): usuario médico `qa_medico_f2_4245167` (`a6156f1f-c26b-4594-bc77-c89d54f3aa43`), paciente `96ed985e-daa0-432c-8369-3175438d04df`, la cita `29925617-0d8f-4412-9a1c-fca29a853a54` pasó de `in_consultation` a `completed` con su historial y receta, y el `nombre_mostrar` de `consultar` (cambiado a "Consultar" por M26-1) se devolvió a `consultar` con SQL, como estaba.

## Supuestos del frontend confirmados (ampliación 5)

- `CreateUserDto.roleId` opcional con `doctor` y `medico` asignado por nombre: sí (`f6646b4`).
- `observations` declarado y guardado en el historial: sí (`c7d86e6`, smoke M35-1db).
- `quantity` `@IsInt @Min(1)`, opcional con 1 por defecto: sí.
- `phoneNumber` en `CreateCommonPersonDto`, máx. 20: sí, con el patrón indicado arriba.

## Fuera de alcance / pendiente

- **Brecha de centros** para usuarios no médicos: decisión de producto (arriba).
- DTOs sin uso con ids `@IsInt` (`permission/dto/relations.dto.ts`, `module.dto.ts`, `role.dto.ts`): código muerto, no los usa ningún controlador; se retiran con M-57.
- `PATCH /menu/:id` permite cambiar `slug` y `userId`: renombrar el slug de un menú rompe sus permisos (los guards usan constantes). Solo lo puede hacer quien tenga `menu.actualizar` (hoy `superusuario`). No se bloqueó porque no se pidió; candidato para M-62/M-65.
- Desactivar el rol `superusuario` sigue permitido y dejaría sin administración a sus usuarios.
- `GET /permissions` sigue registrado dos veces en el controlador (M-62).
- `appointment:detail:${id}` sigue sin invalidarse (M-56).
- El frontend debe aplicar su parte (checklist en `docs/info/2026-09-26-fase-2-integracion-frontend.md`).
