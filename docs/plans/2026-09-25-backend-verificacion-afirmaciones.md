# API Gestión Médica — Verificación de afirmaciones del código

> Fecha: 2026-09-25 · Rama `dt/modules` (`f295695`) · Complementa `docs/plans/2026-09-25-backend-hallazgos.md` (H1–H24).
> Estado: **NUEVO** = no figuraba en el documento de hallazgos; **PENDIENTE** = ya figuraba y se volvió a verificar que sigue presente.

## 1. Método

- **Principio:** no se revisó el código por intuición. Se confrontó cada afirmación del código (comentarios, JSDoc, mensajes de error, descripciones de DTO y Swagger, nombres de métodos y tests) con lo que hacen el sistema y la base.
- **Base de datos:** `bd_gestion_medica` local (PostgreSQL 14.6). Credenciales cargadas desde `.env` con `dotenv`, sin imprimirlas. Sesión con `default_transaction_read_only = on` para las lecturas.
- **Escrituras:** solo las pruebas de INSERT duplicado, cada una dentro de `BEGIN; … ROLLBACK;`. Se ejecutaron diez (p1–p10). No quedó ningún cambio en la base.
- **Validación:** los DTO compilados en `dist/` se pasaron por el mismo `ValidationPipe({ transform: true, whitelist: true })` que usa la API, fuera de HTTP.
- **Librerías:** se leyó el código de `@nestjs/cache-manager` 3.0.1 y de `cache-manager` 7.2.4 en `node_modules`.
- **Límites:** no se modificó código ni configuración. No se hicieron peticiones autenticadas porque no hay credenciales de prueba (ver §5).

### Pruebas de INSERT duplicado (todas con ROLLBACK)

| # | Tabla y valor duplicado | Resultado | Esperado según el código |
|---|---|---|---|
| p1 | `persona_comun` (`letra`, `documento`) iguales | **Acepta 2 filas** | Único ("ya está registrado") |
| p2 | `parametro.medical_centers.name` igual | **Acepta** | Único ("Ya existe un centro médico con ese nombre") |
| p3 | `parametro.specialties.code` igual | **Acepta** | Único ("Código único de la especialidad") |
| p4 | `seguridad.permisos_menus` (`rol_id`, `menu_id`, `permiso_id`) igual | **Acepta** | Único ("Verificar si ya existe la asignación") |
| p5 | `seguridad.roles.nombre` igual | **Acepta** | — |
| p6 | `patients.common_person_id` igual al de un paciente con `deleted_at` puesto | **Falla** con 23505 `UQ_f34e740f037fa739f119134c565` | El índice no es parcial y bloquea también a los registros borrados |
| p7 | `specialties.name` que solo difiere en mayúsculas | **Acepta** | El índice distingue mayúsculas de minúsculas |
| p8 | `parametro.departments.name` igual en el mismo centro | **Acepta** | — |
| p9 | `medical_histories.medical_appointment_id` igual a uno existente | **Falla** con 23505 `UQ_bae767a5679d5c5a5b6b35441cd` | Confirma la hipótesis de H6 |
| p10 | `seguridad.menu.slug` igual | **Acepta** | El guard arma los permisos por slug |

**Duplicados que ya existen en la base:**
- `persona_comun`: 1 grupo de 2 personas con la misma letra `V` y el mismo documento. Cada una tiene usuario y doctor, y una también es paciente. Ids `d53ebb57…` y `7a662859…`.
- `specialties.code = 'MT'`: 2 filas, "Medicina del Trabajo" y "mastología".

---

## 2. Hallazgos

| Severidad | Estado | Archivo:línea | Dimensión | Afirmación | Realidad verificada (evidencia) | Recomendación |
|---|---|---|---|---|---|---|
| **ALTA** | NUEVO | `user/user.service.ts:329-356`, `user/user.controller.ts:79-82`, `user/dto/update-user.dto.ts:4` | Seguridad (escalada de privilegios) | `PATCH /users/:id` "Actualiza campos del usuario" y está protegido por `user.actualizar`. | `UpdateUserDto` es `PartialType(CreateUserDto)`, así que acepta `roleId` y `password`. El `ValidationPipe` real los conserva: `{"roleId":"…","password":"nuevaClave1"}` pasa. `repo.update(id, userFields)` los escribe sin comprobar quién es el dueño ni qué rol tiene. En `seguridad.permisos_menus`, los roles `medico` y `enfermero` tienen `user:actualizar`. Con eso, un médico puede asignarse el rol `superusuario` o cambiar la contraseña de cualquier usuario. | Separar un endpoint de perfil propio (id tomado de `req.user`, sin `roleId`) del de administración. En `update`, ignorar `roleId`, `password` y `status` salvo que haya un permiso de administración explícito. |
| **ALTA** | NUEVO | `auth/auth.service.ts:49-65`, `user/user.service.ts:378-418`, `auth/guards/permission.guard.ts:59-113` | Seguridad (control de acceso) | `DELETE /users/:id` hace "soft delete" y desactiva al usuario (`deletedAt`, `status: false`). | `validateUser` busca por email o nombre sin filtrar `deletedAt` ni `status`: un usuario borrado o desactivado puede volver a iniciar sesión. `remove` no borra la sesión en Redis, así que el token vigente sigue funcionando. `PermissionsGuard` tampoco revisa `user.status`, `role.activo` ni `menu.status`. Hoy la base tiene 0 usuarios borrados, por eso no se observó en datos. | Filtrar `deletedAt IS NULL AND status = true` en el login y en el refresh. Llamar a `redisSession.deleteSession(id)` en `remove`. En el guard, exigir que el rol esté activo. |
| **ALTA** | PENDIENTE (H6, reclasificado de MEDIA) | `medical-appointments/medical-appointments.service.ts:940-994`, `recipe/recipe.service.ts:180-191` | Atomicidad | `finishConsultation`: "1. Crea el historial… 2. Crea la receta… 3. Marca la cita como completada". Se presenta como una sola operación. | Son tres escrituras sin transacción. p9 confirma que `medical_appointment_id` tiene índice único. Camino alcanzable: un ítem de receta con un `medicationId` UUID válido pero inexistente pasa el DTO (`@IsUUID` en `complete-consultation.dto.ts:19-21`) y falla por la FK `recipe_items.medication_id` después de guardar el historial y la cabecera de la receta. **Reintento:** `historyService.create` choca con `UQ_bae767a5…` y responde 400 "Error al crear el historial médico: duplicate key…". La cita queda abierta y no se puede cerrar: el usuario queda trabado. | Envolver todo en `dataSource.transaction()` y pasar el `EntityManager` a los servicios de historial y receta. Validar que existan los `medicationId` antes de escribir. |
| **ALTA** | NUEVO | `patient/patient.service.ts:172-180`, `:584-596`, `medical-appointments/medical-appointments.service.ts:264-293` | Índices BD + borrado lógico | "Esta persona ya está registrada como paciente". `resolvePatient` "busca o crea" al paciente. | `patients.common_person_id` es único **sin filtro parcial** (p6 falla). Después de `DELETE /patient/:id`, que es un borrado lógico: (a) `POST /patient` consulta sin `deletedAt` y responde "ya está registrada", aunque el paciente no aparece en los listados; (b) `POST /medical-appointments` por documento filtra `deletedAt IS NULL`, no encuentra al paciente, intenta insertar uno nuevo y falla por el índice único. No existe un endpoint para restaurar (búsqueda de `restore`: 0 resultados). No se puede volver a registrar a esa persona ni darle una cita. | Al crear, reactivar el paciente borrado en lugar de insertar uno nuevo, o usar un índice único parcial `WHERE deleted_at IS NULL`. |
| **ALTA** | NUEVO | `common-person/common-person.service.ts:52-63`, `user/user.service.ts:81-117`, `:350-356`, `doctors/doctors.service.ts:130-151`, `patient/patient.service.ts:143-169` | Índices BD + reglas | "El número de documento ya está registrado". "Buscar si ya existe CommonPerson por número de documento". | No hay índice único sobre `persona_comun(letra, documento)`: p1 acepta el duplicado y la base **ya tiene un grupo duplicado** con usuario y doctor en ambas filas. Hay cuatro verificaciones de tipo "consultar y luego insertar", y ninguna es atómica. Además: (a) `user.service.create` valida letra y documento (`:84-87`) pero luego busca solo por documento (`:104-106`). Con `E-123` cuando existe `V-123`, pasa la validación y vincula el usuario nuevo a la persona `V-123`, descartando los datos enviados. (b) `user.update` (`:354`) y `common-person.update` cambian el documento sin validar duplicados. | Crear un índice único parcial `(letra, documento) WHERE documento IS NOT NULL AND deleted_at IS NULL`, después de depurar el grupo duplicado. Buscar siempre por letra y documento. Traducir el error 23505 a un error de dominio. |
| **ALTA** | PENDIENTE (H4) | `parameters/controllers/specialty.controller.ts:29-83`, `recipe/recipe.controller.ts:37-41`, `logs/logs.controller.ts:32-33`, `files/files.controller.ts:501-508` | Permisos | Cada endpoint declara el permiso de la acción que realiza. | Se volvió a verificar: `SpecialtyController` no tiene ningún `@Permission`. `POST /recipes` exige `recipe.consultar`, `GET /logs` exige `logs.crear` y `dicom-convert` exige `file.consultar`. | Igual que en H4. |
| MEDIA | NUEVO | `permission/dto/assign-permission.dto.ts:8-9`, `permission/dto/bulk-assign-permissions.dto.ts:15-22,38-45,61-65,81-85,106`, `permission/dto/revoke-permission.dto.ts:8-11`, `permission/dto/bulk-update-permissions.dto.ts:31-34` | Validación vs datos | Swagger documenta `roleId` y `moduleId` con `example: 'uuid-string'`. | (a) Esos campos solo llevan `@ApiProperty`. Con `whitelist: true`, el pipe los **elimina**: `AssignPermissionDto` sale como `{"menuSlug","action"}` sin `roleId`, y `BulkAssignMultipleModules…` sale como `{"permissions":[{"enabled":true}]}`. (b) `RevokePermissionDto` y `BulkUpdatePermissionsDto` exigen `@IsInt @Min(1)` en `roleId`, pero los ids son UUID: siempre responden 400. Quedan inutilizables 7 endpoints: `/permissions/assign`, `/revoke`, `/bulk-update`, `/bulk-assign/role`, `/bulk-assign/role/multiple-modules`, `/bulk-assign/user` y `/bulk-assign/user/multiple-modules`. | Usar `@IsUUID()` en todos los ids. Agregar pruebas e2e de estos endpoints. |
| MEDIA | NUEVO | `common-person/common-person.controller.ts:29-61`, `menu/menu.const.ts:20` | Permisos vs tabla de módulos | El módulo `common-person` se protege con `common-person.{acción}`. | `seguridad.menu` no tiene ninguna fila con slug `common-person` (se listaron los 26 slugs). Los 5 endpoints de `/common-persons` responden 403 a todos los roles, incluido `superusuario`. | Sembrar el menú y sus permisos, o reutilizar un módulo existente de forma explícita. |
| MEDIA | NUEVO | `dashboard/dashboard.controller.ts:24-28`, `dashboard/dashboard.service.ts:196-213` | Permisos + regla de acceso | "Otros: citas de su centro médico". | Solo se filtra por `doctorId`. Cualquier otro usuario autenticado (por ejemplo, `enfermero`) recibe las 10 últimas citas **de todos los centros**, con el paciente incluido. Los 4 endpoints no tienen `@Permission`. | Filtrar por los centros del usuario o por un permiso. Corregir el comentario. |
| MEDIA | NUEVO | `patient/patient.service.ts:381-382`, `doctors/doctors.service.ts:314-315`, `common-person/common-person.service.ts:154-155`, `user/user.service.ts:297-298`, `medical-history/medical-history.service.ts:346-347`, `recipe/recipe.service.ts:291-292`, `parameters/services/medication.service.ts:107-108`, `departments/departments.service.ts:155` | Borrado lógico | Los registros se "eliminan" con borrado lógico. Los mensajes dicen "no existe **o ha sido eliminado**" (`medical-history.service.ts:146,157,169,182`, `recipe.service.ts:139,150,161`). | `deletedAt` es un `@Column` común, no un `@DeleteDateColumn`, así que TypeORM no filtra solo. Los listados sí filtran, pero los `findOne` por id no: los registros borrados se pueden leer, editar y usar como referencia en historiales y recetas. `departments.service.ts:155` usa `deletedAt: undefined`, que en TypeORM **no aplica ningún filtro**. | Usar `@DeleteDateColumn`, o `deletedAt: IsNull()` en cada `findOne` y en las validaciones de referencia. |
| MEDIA | NUEVO | `recipe/recipe.service.ts:180-191`, `:427-439` | Atomicidad | La receta se crea "con sus ítems". La actualización "Elimina ítems existentes" y luego "Crea nuevos ítems". | Son dos escrituras sin transacción. En `create`, si fallan los ítems (FK de `medicationId`), queda la cabecera sin ítems, y reintentar crea **otra** receta, porque no hay índice único por historial. En `update`, se borran los ítems y, si el `save` falla, la receta queda sin medicamentos. Un reintento con datos válidos lo recupera. | Usar una transacción en ambos métodos. |
| MEDIA | NUEVO | `parameters/dto/specialty/create-specialty.dto.ts:26`, `parameters/services/specialty.service.ts:67-77` | Índices BD | "Código único de la especialidad". | No hay índice sobre `code`: p3 acepta el duplicado y la base ya tiene `MT` repetido. El índice de `name` distingue mayúsculas (p7). | Crear un índice único sobre `code` y sobre `lower(name)`, después de depurar `MT`. |
| MEDIA | NUEVO | `permission/services/permission.service.ts:386`, `:755` | Índices BD | "Verificar si ya existe la asignación". | No hay índice sobre `(rol_id, menu_id, permiso_id)`: p4 acepta el duplicado. Hoy hay 0 duplicados entre 204 filas. Si hubiera uno, revocar desactivaría una sola fila y la otra seguiría concediendo el permiso. | Crear un índice único parcial sobre la terna. |
| MEDIA | PENDIENTE (H13) | `src/**/*.spec.ts` (8 archivos) | Cobertura de tests | Hay suites de `PatientService`, `FilesService`, `MenuService`, `LogsService`, `CryptoService` y de 3 controladores. | 8 specs con 8 `it`, todos `should be defined`. Ninguno invoca un método. Además no compilan (ver H13). No hay pruebas de guards, permisos, citas ni del flujo de consulta. | Igual que en H13. Priorizar los hallazgos ALTA de esta tabla. |
| MEDIA | PENDIENTE (H8) | `mammography-analysis/mammography-analysis.service.ts:438` | Reglas | `highRisk` indica alto riesgo. | Se volvió a verificar `probability >= 80` sin mirar `status`. | Igual que en H8. |
| BAJA | NUEVO | `app.module.ts:47-58` | Configuración / caché | `store: redisStore`, `ttl: … 3600 // segundos`. | `@nestjs/cache-manager` 3 con `cache-manager` 7 ignora la opción `store` (solo lee `stores`: `cache.providers.js`). Resultado: caché **en memoria del proceso** con TTL en **milisegundos**. El default es 3,6 s y cada `set(k, v, 600)` dura 0,6 s. Además, `appointment:detail:${id}` (`medical-appointments.service.ts:746`) nunca se invalida: las escrituras borran `appointment:${id}`, una clave que nunca se crea. Hoy el TTL de 0,6 s lo oculta. | Si se configura Redis con TTL en segundos, antes hay que corregir las claves de invalidación, o aparecerán lecturas desactualizadas de hasta 10 min. |
| BAJA | NUEVO | `medical-center/medical-center.service.ts:123-133`, `parametro.departments` | Índices BD | "Ya existe un centro médico con ese nombre". | No hay índice (p2). La búsqueda no filtra los borrados: hay 1 centro borrado cuyo nombre queda bloqueado. `departments.name` también acepta duplicados (p8). | Crear un índice único parcial. |
| BAJA | NUEVO | `seguridad.roles`, `seguridad.menu` | Índices BD | `PermissionsGuard` arma los permisos como `slug.acción`. | `roles.nombre` y `menu.slug` no tienen índice único (p5 y p10). Un slug duplicado combina los permisos de los dos menús. | Crear índices únicos. |
| BAJA | NUEVO | `medical-center/medical-center.service.ts:188-190`, `dto/medical-center-response.dto.ts:132-133` | Rendimiento / reglas | "Los conteos de doctores y departamentos se calculan desde las relaciones cargadas". | El listado carga las colecciones completas de doctores y departamentos solo para contarlas (`.length`), y cuenta también los departamentos borrados, porque el join no filtra `deletedAt`. | Usar `loadRelationCountAndMap` con condición, o un subquery de conteo. |
| BAJA | NUEVO | `doctors/doctors.service.ts:148-186`, `patient/patient.service.ts:164-169` | Atomicidad | — | La persona se guarda antes de validar la licencia, las alergias y otros datos, y sin transacción. Si una validación falla, la persona queda huérfana. El reintento la reutiliza, así que el usuario no queda trabado. | Validar antes de escribir y usar una transacción. |
| BAJA | NUEVO | `role/role.service.ts:181-196`, `menu/menu.service.ts:207-224`, `user/user.service.ts:411-415`, `:137-139` | Mensajes de error | "Rol no encontrado" (404). Comentario: "Si commonPerson ya tenía usuario, esto lo sobrescribe". | `role.remove` y `role.update` convierten el `NotFound` en 500. `menu.remove` es un borrado físico: con permisos asignados falla por la FK `permisos_menus.menu_id` y responde 404. `user.remove` responde 404 ante cualquier error. El comentario es falso: el índice único `users.common_person_id` hace fallar la operación, no la sobrescribe. | Propagar las `HttpException` y mapear los errores 23503 y 23505. |
| BAJA | NUEVO | `user/entities/user.entity.ts:17-21` | Índices BD + borrado lógico | Borrado lógico de usuarios. | Los índices únicos de `email` y `name` no son parciales: no se puede volver a crear un usuario con el email de uno borrado. | Usar índices parciales o reactivar el usuario. |
| BAJA | NUEVO | `doctors/dto/doctor-schedule.dto.ts:26,31,84,90` | Validación vs datos | `startTime` y `endTime` "formato HH:mm". | Las 18 filas de `doctor_schedules` se devuelven como `HH:MM:SS` (`08:00:00`). Si el cliente reenvía el valor que leyó, la actualización responde 400. No se verificó qué envía el frontend. | Aceptar `^\d{2}:\d{2}(:\d{2})?$`, o formatear la salida. |
| BAJA | NUEVO | `parametro.departments_doctors` | Drift de esquema | `doctor.entity.ts:104-105` usa `departments_doctors`. | Existen dos tablas: `public.departments_doctors` (13 filas, la que se usa) y `parametro.departments_doctors` (0 filas, huérfana). `synchronize()` no la elimina. | Borrarla en una migración. |
| BAJA | PENDIENTE (H19) | `redis-session/redis-session.service.ts:117-124`, `auth/guards/JwtExternal.guard.ts` (58 LOC), `auth/guards/headerToken.guard.ts` (39), `user/dto/user-query.dto copy.ts` (18), `email/*` (166) | Código muerto | — | `refreshSession`: 0 llamadas. Los guards y el DTO duplicado no se usan. `EmailModule` no se importa. | Igual que en H19. |
| INFO | NUEVO | FKs sobre `patients` y `doctors` | Integridad | Los borrados son lógicos. | `medical_histories`, `recipes` y `medical_appointments` tienen `ON DELETE CASCADE` hacia `patients` y `doctors`. Hoy ningún servicio borra físicamente pacientes ni doctores, pero un `DELETE` manual eliminaría la historia clínica. | Cambiar a `RESTRICT` en la próxima migración. |

---

## 3. Lo que está bien resuelto (no "arreglar")

- **Índices únicos reales y probados:** p6 y p9 fallan como corresponde. Existen índices únicos sobre:
  - `appointment_number`, `consultation_number`, `recipe_number` y `patient_code`
  - `doctors.license_number` y `doctors.common_person_id`
  - `users.email`, `users.name` y `users.common_person_id`
  - `medical_histories.medical_appointment_id`
  - los nombres de `allergies`, `medications` y `chronic_diseases`

  La carrera de numeración (H20) termina en error, no en duplicados.
- **Transacción única en el alta de usuario:** `user/user.service.ts:100-218` usa un solo `queryRunner` para la persona, el usuario y el doctor, con rollback en el `catch`. El borrado de usuario también es transaccional (`:378-418`).
- **Guard de sesión:** compara el token presentado con el guardado en Redis, no solo que la sesión exista (`auth/guards/session.guard.ts:62-72`, `redis-session.service.ts:85-104`). Se registra como global en `main.ts:103-107`.
- **Caché y control de acceso por usuario:** las claves de los listados filtrados incluyen la identidad efectiva del usuario, así que la respuesta de un médico no se sirve a otro. Ver `doctors.service.ts:225`, `patient.service.ts:300`, `recipe.service.ts:233`, `medical-history.service.ts:240`, `medical-appointments.service.ts:677` y `medical-center.service.ts:180`. El detalle de cita vuelve a aplicar el control de acceso sobre la copia en caché (`medical-appointments.service.ts:747-751`).
- **Borrado lógico bien filtrado:** `medical-center.service.ts:275` (`findOne`), `resolvePatient` (`medical-appointments.service.ts:220`, `:238-241`) y los conteos del dashboard (`dashboard.service.ts:94-161`).
- **Estadísticas de mamografía:** seleccionan solo las 4 columnas que usan (`mammography-analysis.service.ts:427-432`), no la entidad completa.
- **Permisos de `machine-learning` y `mammography-analysis`:** están sembrados, con las 4 acciones, para `medico` y `superusuario`.

---

## 4. Resumen para el desarrollador

**Bloquea (corregir antes de cualquier ambiente con usuarios reales):**
1. **Escalada de privilegios** por `PATCH /users/:id` (`roleId` y `password`) con el permiso que ya tienen `medico` y `enfermero`.
2. **Usuarios borrados o desactivados** que siguen iniciando sesión y conservan su token.
3. **`finishConsultation` no atómico**, con bloqueo confirmado por el índice único (p9).
4. **Pacientes borrados** que no se pueden volver a registrar ni citar (p6).
5. **Personas duplicadas:** falta el índice (p1), ya hay un grupo duplicado y `user.create` puede vincular un usuario a otra persona.
6. **Permisos de H4**, todavía presentes.

**Deuda (planificar):**
- 7 endpoints de permisos inutilizables por los DTO.
- El módulo `common-person` no está sembrado.
- El dashboard expone citas de todos los centros.
- `findOne` que no excluyen registros borrados.
- Recetas no atómicas.
- Índices faltantes en catálogos.
- La caché no es Redis ni usa segundos.
- Mensajes de error que no corresponden al fallo.
- Tests sin valor (H13).

---

## 5. No verificado

- **Concurrencia real:** no se lanzaron peticiones HTTP en paralelo. La duplicación bajo carga se infiere de p1–p5 (la base acepta el duplicado) y del patrón "consultar y luego insertar".
- **Escalada y login de usuario borrado de punta a punta:** no hay credenciales de prueba ni seeder. Se verificaron el DTO real con el `ValidationPipe`, el código del servicio y los permisos en la base, pero no una petición autenticada.
- **Origen de los duplicados existentes** (`persona_comun` y `specialties.code = 'MT'`): no hay auditoría de altas que permita saber si entraron por la API o por SQL manual.
- **Uso de los endpoints de permisos rotos y del formato de horarios en el frontend:** no se revisó `app-gestion-medica`.
- **`CryptoService`:** no se contrastó que los algoritmos declarados coincidan con los que se aplican.
- **Throttler:** no se midió el bloqueo real. La configuración (`app.module.ts:60-80`) coincide con sus comentarios.
- **Forma de respuesta frente a Swagger:** el interceptor envuelve las respuestas en `{ code, data }`, pero los `@ApiResponse` no lo declaran. No se revisaron endpoint por endpoint.
- **H1, H3, H5, H11, H12 y H14:** no se volvieron a verificar en esta pasada. Siguen como están en el documento de hallazgos.
