# API Gestión Médica — Hallazgos, riesgos y deuda técnica

> Fecha: 2026-09-25 · Rama `dt/modules` (`3e96ca1`) · Complementa `docs/info/2026-09-25-backend-arquitectura.md`.
> Método: lectura estática del código. Nada se ejecutó: no hay `node_modules` ni entorno levantado. Donde un hallazgo depende del comportamiento en ejecución, se marca **"a confirmar"**.
>
> **Actualizado con resultados de ejecución (2026-09-25).** El backend se arrancó contra `bd_gestion_medica` (puerto 8020) y se probó contra el contenedor `medos-backend` (8008). El texto original de cada hallazgo se conserva; el resultado se agrega en una línea **Estado en ejecución**. Ver también §7.

**Criterio de severidad**
- **ALTA**: corrompe datos, rompe una regla por un camino alcanzable vía API, deja al usuario trabado, hace fallar una migración con datos, o desactiva un control de seguridad.
- **MEDIA**: riesgo real pero acotado, o que requiere condiciones adicionales.
- **BAJA**: deuda técnica, higiene o funcionalidad secundaria rota.

---

## 1. Resumen

| # | Sev. | Hallazgo | Evidencia principal |
|---|---|---|---|
| H1 | ALTA | Path traversal de lectura y escritura en `files` | `files/files.service.ts:88`, `:285-290`, `:435-444` |
| H2 | ALTA | `synchronize()` en cada arranque y sin migraciones — **CONFIRMADO** que corre | `database/schema-init.service.ts:25` |
| H3 | ALTA | Los logs guardan tokens y cuerpos, y `/logs/ui/api` los expone a cualquier usuario autenticado — almacenamiento **CONFIRMADO**; exposición pendiente | `HttpExceptionFilter.ts:70-72`, `logs.controller.ts:87-105` |
| H4 | ALTA | Permisos mal asignados: `POST /recipes` con `consultar`, CRUD de especialidades sin permiso | `recipe.controller.ts:37-41`, `specialty.controller.ts:22-83` |
| H5 | MEDIA | `/uploads` se sirve sin autenticación, imágenes médicas incluidas — **CONFIRMADO** | `app.module.ts:81-88` |
| H6 | MEDIA | `finishConsultation` hace 3 escrituras sin transacción | `medical-appointments.service.ts:967-986` |
| H7 | MEDIA | El resultado del modelo lo decide el cliente, y el detector no tiene autenticación | `mammography-analysis.service.ts:126-142`, `detector/main.py:34-47` |
| H8 | MEDIA | `probability` significa cosas distintas en detector y backend: la métrica `highRisk` cuenta benignos | `detector/main.py:74-89`, `mammography-analysis.service.ts:438` |
| H9 | MEDIA | Filtro por médico incompleto y admin detectado por subcadena del nombre de rol | `patient.service.ts:373`, `doctors.service.ts:65-72` |
| H10 | MEDIA | Doble FK entre `users` y `persona_comun` | `user.entity.ts:65-67`, `common-person.entity.ts:78-80` |
| H11 | **ALTA** (antes MEDIA) | Bull Board montado como middleware Express fuera de los guards — **CONFIRMADO** en ejecución | `main.ts:112-114` |
| H12 | MEDIA | Archivo de entorno versionado con secretos (`sdfsdf`) | `git ls-files sdfsdf` |
| H13 | MEDIA | Pruebas sin valor: 8 specs de plantilla y el e2e sin configuración — **causa corregida**: fallan al compilar | `src/**/*.spec.ts`, `package.json`, `tsconfig.json` |
| H14–H24 | BAJA | Ver §3 | — |

---

## 2. Hallazgos ALTA y MEDIA

### H1 — Path traversal en `files` · ALTA
- **Qué pasa:** varias rutas arman la ruta de disco con texto del cliente y `path.join`, sin normalizar ni comprobar que el resultado quede dentro de `uploads/`.
  - **Escritura arbitraria:** `uploadFile` usa `dto.name` tal cual (`files/files.service.ts:88`), y el DTO solo valida `@IsString() @IsNotEmpty()` (`files/dto/create-file.dto.ts:7-10`). Un `name` como `../../dist/main.js` sobrescribe fuera de `uploads/`.
  - **Directorios fuera de `uploads/`:** `uploadAppointmentFile` arma el directorio con `medicalCenterId` y `appointmentId`, que vienen del body sin validar (`files.controller.ts:150-165`, `files.service.ts:285-291`). El nombre del archivo sí es aleatorio.
  - **Lectura arbitraria:** `serveProfilePhoto` (`files.service.ts:435-444`) y sus equivalentes en `:676-686` y `:762-772` unen `:ownerId` y `:filename` desde la URL. Express decodifica `%2F`, así que `..%2F..%2F.env` alcanza archivos del servidor.
- **Alcance:** requiere un usuario autenticado con `file.crear` o `file.consultar`. Aun así, anula el aislamiento del directorio de subidas.
- **Dirección:** validar los ids con `@IsUUID()`. Quedarse solo con `path.basename()` del nombre. Tras `path.resolve`, comprobar que la ruta final empiece por la raíz de `uploads`.

### H2 — Esquema sincronizado en cada arranque, sin migraciones · ALTA
- **Qué pasa:** la conexión declara `synchronize: false` (`database/getMainConnection.ts:89`), pero `SchemaInitService.onApplicationBootstrap` llama a `this.dataSource.synchronize()` (`database/schema-init.service.ts:25`) en todos los ambientes. No existen migraciones.
- **Impacto:** si se renombra una propiedad o columna, o cambia su tipo, TypeORM elimina la columna vieja y crea una nueva: los datos se pierden al reiniciar. Tampoco hay forma de reproducir o revertir el esquema.
- **Dirección:** quitar `synchronize()`, generar una migración inicial desde la BD actual y usar `migration:run` en el despliegue. Si se mantiene, limitarlo a `NODE_ENV=development`.
- **Estado en ejecución (2026-09-25): CONFIRMADO** que corre. En el arranque del 2026-09-25 no produjo cambios: diff de esquema vacío y conteos de filas de las 41 tablas idénticos antes y después. El riesgo sigue vigente para el próximo cambio de entidades.

### H3 — Los logs capturan credenciales y cualquier usuario autenticado puede leerlos · ALTA
- **Qué se guarda:** el filtro global persiste `headers`, `requestQuery` y `requestBody` completos (`common/exceptions/HttpExceptionFilter.ts:70-72`) en `auditoria.error_log`, en columnas jsonb (`logs/entities/error-log.entity.ts:44-54`). Eso incluye `Authorization` y `Cookie`. Solo se enmascara `password` en el primer nivel del body (`logs/logs.service.ts:152-167`).
- **Quién lo lee:** `GET /logs/ui/api` no tiene `@Permission` ni chequeo de rol, solo verifica el JWT (`logs/logs.controller.ts:87-105`). Por `permission.guard.ts:43-46` basta cualquier sesión válida para leer todos los logs.
  - Esos logs contienen tokens de otros usuarios. Un token sigue sirviendo mientras la sesión de su dueño siga activa.
  - También contienen datos clínicos de los cuerpos de petición.
- **Agravantes:**
  - `/logs/ui/view` recibe el JWT por `?token=` y lo escribe en el HTML (`logs.controller.ts:54-80`).
  - `GET /logs` exige `logs.crear` en lugar de `logs.consultar` (`logs.controller.ts:33`).
- **Dirección:**
  - Excluir `authorization`, `cookie` y `token` de los headers antes de guardar, y enmascarar los campos sensibles del body en profundidad.
  - Proteger `/logs/ui/api` con `P(logs.consultar)` y el mismo chequeo de rol que la vista.
- **Estado en ejecución (2026-09-25): CONFIRMADO en almacenamiento.** En `auditoria.error_log`, 572 de 651 filas contienen tokens `Bearer` y 58 contienen `"password"`. Pendiente verificar si `/logs/ui/api` los devuelve a un usuario autenticado: no se contó con credenciales de prueba (ver H14).

### H4 — Permisos que no corresponden a la acción · ALTA
- `POST /recipes` usa `PermissionActionsMenu.VIEW` (`recipe/recipe.controller.ts:37-41`): cualquier rol que solo pueda consultar recetas puede emitirlas.
- `SpecialtyController` no declara ningún `@Permission` (`parameters/controllers/specialty.controller.ts:22-83`). Como `PermissionsGuard` deja pasar lo que no declara permisos (`auth/guards/permission.guard.ts:43-46`), cualquier usuario autenticado puede crear, editar o borrar especialidades.
- Hay otras asignaciones incoherentes de menor impacto:
  - `POST /files/dicom-convert` usa `consultar` (`files.controller.ts:508`).
  - `UPLOAD`, `ASSIGN` y `DIAGNOSTICAR` son alias de `'crear'` (`permission/permission.const.ts`). Por eso `permission.crear` alcanza para `/permissions/roles/:roleId/assign-all`, que da todos los permisos a un rol.
- **Dirección:** corregir los decoradores. Considerar un modo "denegar por defecto": un handler sin `@Permission` ni `@Public` debería fallar o exigir una marca explícita como `@AuthenticatedOnly()`.

### H5 — `/uploads` público · MEDIA
- **Qué pasa:** `ServeStaticModule` sirve `process.cwd()/uploads` en `/uploads` (`app.module.ts:81-88`). Es middleware Express, así que no pasa por los guards globales.
- **Qué queda expuesto:** las imágenes de citas (`uploads/{userId}/{centerId}/{appointmentId}/…`), las de mamografía (`uploads/mammography-analyses/…`) y las fotos de personas. Cualquiera que tenga la URL las descarga sin autenticarse. Las URLs públicas se devuelven en respuestas, por ejemplo en `files.service.ts:73` y `:97`.
- **Por qué MEDIA y no ALTA:** los nombres llevan timestamp más un sufijo aleatorio y los directorios son UUID, así que no se pueden enumerar a ciegas.
- **Dirección:** servir los archivos solo por los endpoints con guard, que ya existen (`/files/appointment-files/:id`, `/mammography-analyses/:id/image`), y retirar el static o limitarlo a recursos no sensibles.
- **Estado en ejecución (2026-09-25): CONFIRMADO.** Archivos `.webp` y `.jpg` existentes se descargaron sin token (200) desde el contenedor en el puerto 8008.

### H6 — Finalizar consulta no es atómico · MEDIA
- **Qué pasa:** `finishConsultation` hace tres escrituras separadas, sin transacción (`medical-appointments/medical-appointments.service.ts:967-986`):
  1. Crea la historia clínica.
  2. Crea la receta.
  3. Marca la cita como completada.
- **Consecuencia:** si la receta falla, la historia queda escrita y la cita sigue abierta.
- **Hipótesis (a confirmar):** `medical_histories.medical_appointment_id` es la join column de un `OneToOne` (`medical-history.entity.ts:196`), y TypeORM le crea un índice único. Si es así, reintentar falla con violación de unicidad (500) y el médico no puede cerrar la consulta.
- **Dirección:** envolver el flujo en `dataSource.transaction()` y pasar el `EntityManager` a los services de historia y receta.

### H7 — Integridad del resultado del modelo · MEDIA
- **Del lado del backend:** no consulta al detector. Guarda `prediction`, `probability`, `status` y `rawResponseJson` tal como los envía el cliente (`mammography-analysis.service.ts:126-142`). Un usuario con `mammography-analysis.crear` puede registrar un "resultado del modelo" inventado.
- **Del lado del detector:** no autentica. Recibe el header `authorization` y no lo usa, y tiene `allow_origins=["*"]` con `allow_credentials=True` (`detector-cancer-de-mama/main.py:34-47`).
- **Por qué importa:** en una tesis el flujo puede ser aceptable, pero conviene declararlo como limitación.
- **Dirección:** que el backend haga de proxy hacia `/predict` (con un secreto compartido) y guarde la respuesta que él mismo recibió. Como alternativa, firmar la respuesta en el detector.

### H8 — Semántica de `probability` inconsistente · MEDIA
- **Qué devuelve el detector:** la confianza de la clase predicha, no la probabilidad de malignidad (`main.py:74-89`).
  - MALIGNO: `(1-p)*100`, en el rango 85–100.
  - BENIGNO: `p*100`, en el rango 15–100.
- **Qué asume el backend:**
  - El DTO la describe como "Probabilidad de malignidad (0-100)" (`create-mammography-analysis.dto.ts:63`).
  - `getDailyStats` cuenta `highRisk = probability >= 80` sin mirar `status` (`mammography-analysis.service.ts:438`), así que un benigno con 90 % de confianza cuenta como "alto riesgo".
  - El orden por urgencia (`:482-502`) sí interpreta el valor como confianza.
- **Dirección:** documentar el contrato en un solo lugar y calcular `highRisk` solo sobre `status = 'danger'`. Otra opción es guardar la probabilidad de malignidad cruda (`p`) en una columna aparte.

### H9 — Filtro por médico incompleto · MEDIA
- **Rutas sin filtro:** el listado de pacientes sí se filtra por médico (`patient.service.ts:293-330`), pero estas no:
  - `GET /patient/:id` (`patient.service.ts:373`, no recibe el usuario)
  - `GET /recipes/medical-history/:medicalHistoryId` (no recibe `req.user`)
  - Todo `mammography-analyses`: bandeja, ranking, detalle e imagen
- **Detección de admin:** un usuario es admin si el nombre de su rol contiene `admin` o `super` (`doctors/doctors.service.ts:65-72`, `medical-appointments.service.ts:149-156`, `medical-center.service.ts:103-104`). Un rol llamado, por ejemplo, "Administrativo" queda exento del filtro.
- **Dirección:** decidir por permiso o por un flag de rol, no por el nombre. Aplicar `AuthContextService` también en los `findOne` y en mamografías.

### H10 — Doble relación 1:1 User ↔ CommonPerson · MEDIA
- **Qué pasa:** los dos lados declaran `@JoinColumn`: `users.common_person_id` (`user/entities/user.entity.ts:65-67`) y `persona_comun.user_id` (`common-person/entities/common-person.entity.ts:78-80`). Con `synchronize()` existen las dos FK, y pueden no coincidir.
- **Por qué afecta la seguridad:** `getDoctorIdForUser` solo sigue `users.common_person_id` (`common/services/auth-context.service.ts:52-63`).
  - Si ese lado queda vacío, el médico no se detecta y deja de aplicarse su filtro.
  - En `patient.findAll` un `doctorId` nulo significa "sin filtro".
- **Dirección:** elegir un solo lado dueño y migrar los datos.

### H11 — Bull Board fuera de los guards · ~~MEDIA (a confirmar)~~ ALTA (confirmado 2026-09-25)
- **Qué pasa:** `main.ts:112-114` registra `app.use('/admin/queues', bullRouter)` antes de `app.listen()`. Las rutas Nest se registran al inicializar, así que ese middleware probablemente atiende `/admin/queues` antes que el controlador que valida JWT y rol (`bull-board.controller.ts:92-154`). El comentario de `main.ts:95` dice que las rutas se excluyen de los guards, pero no hay código que lo haga.
- **Impacto actual:** bajo. La única cola es `emailQueue` y no tiene productor ni worker activo (H19).
- **Dirección:** confirmar con `GET /admin/queues` sin cookie. Montar el router una sola vez y solo detrás de la validación.
- **Estado en ejecución (2026-09-25): CONFIRMADO.** `/admin/queues` y `/admin/queues/api/queues` responden 200 sin autenticación, con `readOnlyMode: false` y `allowRetries: true`.
- **Reclasificación: MEDIA → ALTA.** Cumple el criterio "desactiva un control de seguridad": la validación de JWT y rol de `bull-board.controller.ts` no se aplica, y cualquiera que alcance el puerto puede reintentar o limpiar trabajos sin autenticarse. Que hoy la cola no tenga productor ni worker (H19) reduce el impacto actual, no la falla del control; el daño crece en cuanto `EmailModule` se active.

### H12 — Archivo de entorno versionado · MEDIA
- **Qué pasa:** `sdfsdf`, en la raíz y versionado desde `6ed4ce5`, contiene `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DB_PASS`, `EMAIL_PASS`, `TOKEN_VALIDATOR` y `REDIS_SESSION_PASS` con valores. `DB_NAME=bd_metro_ads` sugiere que viene de otro proyecto. No se pudo determinar si los valores son reales.
- **Dirección:** eliminarlo del repositorio y rotar los secretos si alguno está en uso.

### H13 — Pruebas sin valor · MEDIA
- **Qué hay:** 8 specs de plantilla (`should be defined`) que registran el service sin mockear sus repositorios, por ejemplo `patient/patient.service.spec.ts:8-10`. No se ejecutaron. Por la inyección de repositorios, es de esperar que fallen al compilar el módulo de prueba (hipótesis).
- **Qué falta:** `test:e2e` apunta a `test/jest-e2e.json`, que no existe. No hay pruebas de guards, permisos, citas, archivos ni mamografías.
- **Dirección:** empezar por pruebas de servicio con repositorios en memoria o mocks para `finishConsultation`, disponibilidad de citas y `PermissionsGuard`. Agregar un e2e de autorización por endpoint.
- **Estado en ejecución (2026-09-25): CORREGIR la causa.** La hipótesis de repositorios sin mockear no llegó a probarse: las 8 suites fallan antes, en compilación. `tsconfig.json` define `"types": ["node", "express", "multer"]` y ts-jest no ve `describe`, `it`, `expect` ni `beforeEach` (TS2593/TS2304). 0 tests ejecutados.

---

## 3. Hallazgos BAJA (deuda técnica)

| # | Hallazgo | Evidencia |
|---|---|---|
| H14 | El JWT lleva el objeto de usuario completo (PII) y no incluye `roleName`, así que los chequeos `roleName === 'superusuario'` de Logs UI y Bull Board siempre fallan: esas vistas son inaccesibles | `auth.service.ts:113-116`, `logs.controller.ts:65`, `bull-board.controller.ts:123` |
| H15 | La clave del cifrado de módulos está fija en el backend (fallback) y en el frontend: es ofuscación, no un control de seguridad | `auth/utils/permissions-cipher.util.ts:5`, `app-gestion-medica/.../permissions-cipher.util.ts:1` |
| H16 | Secretos de respaldo en código: `'secret'`, `'default_jwt_key'`. `JWT_REFRESH_SECRET` no está en Joi | `auth.module.ts:24`, `jwt.strategy.ts:21`, `JwtExternal.guard.ts:33`, `validation.ts` |
| H17 | La sesión Redis vive 3600 s fijos y el refresh 7 días: tras 1 h sin actividad el refresh ya no sirve | `auth.service.ts:137`, `:125` |
| H18 | `PermissionsGuard` consulta la BD con tres niveles de relaciones en cada petición, sin caché | `permission.guard.ts:59-94` |
| H19 | Código muerto: `JwtStrategy`, `JwtExternalGuard`, `HeaderTokenGuard` (aunque `TOKEN_VALIDATOR` es obligatorio en Joi), `EmailModule` sin importar (la cola no tiene worker), `VideoPublicity`, entidades vacías (`crypto`, `email`, `file`), `user-query.dto copy.ts`, esquema `selfManagement` | `app.module.ts`, `email.module.ts`, `schema-init.service.ts:18` |
| H20 | Carrera en la numeración (`APT-`, consulta, receta): leer el máximo y sumar 1. Concurrente da 500 por el índice único. El chequeo de choque de horario es consultar y luego actuar | `medical-appointments.service.ts:192-209`, `:518` |
| H21 | Límite de body de 350 MB y subidas de 300 MB en memoria (`dicom-convert`, `mammography-analyses`): riesgo de memoria | `main.ts:36-37`, `files.controller.ts:503-506` |
| H22 | El filtro devuelve `exception.message` crudo en los 500 (p. ej., errores de PostgreSQL). El login distingue "usuario no encontrado" de "credenciales inválidas". **REFORZADO en ejecución (2026-09-25):** un 404 en `/uploads/<inexistente>` expone la ruta absoluta del servidor (`D:\_trabajo\...`), porque los estáticos se sirven antes que los guards | `HttpExceptionFilter.ts:46-48`, `auth.service.ts:54-59`, `app.module.ts:81-88` |
| H23 | `/health` no es `@Public`: los monitores externos necesitan un token. **CONFIRMADO (2026-09-25):** responde 403 "Token requerido" | `health/health.controller.ts:30` |
| H24 | `docker-compose.yml`: rutas de build de front y ML que no existen en `tesis/`, Redis expuesto en 8010 sin contraseña, PostgreSQL comentado | `docker-compose.yml:36-38`, `:60-62`, `:80-86` |

Otros detalles menores:
- `ValidationPipe` está registrado dos veces (`main.ts:88`, `app.module.ts:124`).
- `GET /permissions` está declarado dos veces (`permission.controller.ts:134`, `:349`).
- Las convenciones de columnas son mixtas (`estatus`/`activo`/`status`/`is_active`, `"isActive"` sin snake_case en `doctors` y `medical_centers`).
- Hay servicios de más de 1000 líneas (`medical-appointments.service.ts` 1294, `permission.service.ts` 1387).
- **Swagger público (ejecución, 2026-09-25):** `/api` y `/api-json` responden 200 sin token en desarrollo. Conviene limitarlos a `NODE_ENV=development` o protegerlos.

---

## 4. Lo que está bien resuelto (no "arreglar")

- **Contraseñas:** bcrypt con costo 10 en creación y actualización (`user/user.service.ts:129`, `:348`; `user/user-security.service.ts:61`, `:196`).
- **Sesión única:** se compara el token contra Redis, no solo su existencia, así que logout y un nuevo login invalidan el token anterior (`redis-session.service.ts:85-104`).
- **Validación global:** `whitelist: true` y `transform: true`. Los DTO de mamografía validan enum, rango y UUID (`create-mammography-analysis.dto.ts:58-101`).
- **Consultas parametrizadas en QueryBuilder:** en los logs, el `orderBy` se toma de una lista blanca (`logs.service.ts:100-102`).
- **Subida de mamografías:** lista blanca de MIME y nombre almacenado aleatorio (`mammography-analysis.service.ts:90-106`).
- **Orden clínico de urgencia:** una sola regla, reutilizada en bandeja, ranking y listado por cita (`mammography-analysis.service.ts:482-502`).
- **Unicidad en BD:** los números de cita, consulta y receta tienen índice único. La carrera de H20 termina en error, no en duplicados.
- **Refresh:** exige coincidencia exacta con el refresh guardado, lo que impide reutilizar uno anterior (`auth.service.ts:163-170`).

---

## 5. Discrepancias entre `ARCHITECTURE_BACKEND.md` y el código

| Tema | Lo que dice la guía | Lo que hace el código |
|---|---|---|
| Módulo de mamografías | No lo menciona | Existe `src/mammography-analysis/` con 8 endpoints y su tabla |
| Sincronización | "Manual via SchemaInitService" | `synchronize()` automático en cada arranque (`schema-init.service.ts:25`) |
| ValidationPipe | `forbidNonWhitelisted: true`, `validationError` | Solo `{ transform, whitelist }` (`main.ts:88`); no hay `forbidNonWhitelisted` en `src/` |
| Límite de body | 100 MB | 350 MB (`main.ts:36-37`) |
| CORS | `CORS_ORIGIN.split(',')`, headers `Content-Type, Authorization` | `CORS_ORIGIN || true` (cualquier origen si no se define), más los headers `token/Token/TOKEN` (`main.ts:56-67`) |
| `app.config.ts` | Existe y centraliza el bootstrap | No existe; todo está en `main.ts` |
| Static `/uploads` | `app.use('/uploads', express.static(...))` | `ServeStaticModule` en `app.module.ts:81-88` (mismo efecto: público) |
| Vistas | `setBaseViewsDir('src/logs/views')` | `join(__dirname, '..', 'src')` (`main.ts:33`) |
| Estructura de la sesión Redis | `accessToken`, `email`, `device`, `ip`, `expiresAt` | `access_token`, `refresh_token`, `userId`, `roleId`, `loginAt/refreshedAt` (`auth.service.ts:128-138`) |
| TTL de la sesión | `REDIS_SESSION_TTL` configurable | 3600 fijo en código; la variable no se lee |
| Cifrado de permisos | `crypto.subtle.encrypt()` con `PERMISSIONS_SECRET` | `crypto.createCipheriv` de Node con fallback fijo; `crypto.subtle` se usa solo en el frontend para descifrar |
| Guard 1 sin token | `ForbiddenException('Missing token')` | `HttpException` 403 "Token requerido para esta petición" (`jwt-auth.guard.ts:58-63`) |
| Ejemplo IDOR | Filtra por `role.name === 'Doctor'` | Resuelve el doctor por `User → CommonPerson → Doctor`; los admins, por subcadena del nombre de rol |
| Transacciones | Patrón general para operaciones multi-tabla | Solo en `user.service.ts:100`, `:382`; `finishConsultation` no es atómico |
| Colas | Flujo completo de email por BullMQ | `EmailModule` no se importa: no hay productor ni worker activos |
| `appointment-upload` | 50 MB | 300 MB (`files.controller.ts:144`) |
| Puerto | `PORT || 7008` | Joi por defecto 7008, `main.ts` usa 3000 como fallback, compose fija 8008 |
| Log de arranque | — | Anuncia `http://host:port/api` como URL de la app, pero `/api` es solo Swagger y no hay prefijo global (`main.ts:123`) |

`README.md`: el diagrama declara `id: number` y `roleId: number`, pero las PK son UUID. Además menciona "tipos de sangre" como catálogo, y ese catálogo no existe: `blood_type` es un varchar en `patients`.

---

## 6. Orden sugerido de atención

1. H1, H3 y H4: son cambios acotados de validación y decoradores.
2. H2: migración inicial y retiro de `synchronize()` antes de cualquier ambiente con datos reales.
3. H6 y H10: consistencia de datos clínicos.
4. H5, H9 y H11: cierre de accesos laterales. *(2026-09-25: H11 pasa a ALTA; conviene adelantarlo al punto 1.)*
5. H7 y H8: documentar el contrato del detector en la memoria de tesis como decisión o limitación.
6. H13: red mínima de pruebas antes de refactorizar.

---

## 7. Nota de ejecución: verbos HTTP de roles y permisos

No figuraba como hallazgo de este documento (está registrado como Front H-01 en `app-gestion-medica`). Resultado contra el contenedor `medos-backend` (2026-09-25):

| Petición del frontend | Resultado | Con `PATCH` |
|---|---|---|
| `PUT /roles/:id` | 404 | 403 sin token (la ruta existe) |
| `POST /permissions` | 404 | 403 sin token (la ruta existe) |
| `PUT /permissions/:id` | 404 | 403 sin token (la ruta existe) |

El backend solo expone `PATCH`; el desajuste se corrige en el frontend o agregando los verbos en el backend.
