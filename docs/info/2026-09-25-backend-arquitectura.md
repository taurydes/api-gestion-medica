# API Gestión Médica — Arquitectura del backend

> Fecha: 2026-09-25 · Rama analizada: `dt/modules` (último commit `3e96ca1`) · Fuente: el código, no la documentación previa.
> Discrepancias con `ARCHITECTURE_BACKEND.md` y hallazgos de riesgo: ver `docs/plans/2026-09-25-backend-hallazgos.md`.

---

## 1. Contexto y propósito

Backend REST de la tesis de gestión médica. Forma parte de tres piezas:

| Pieza | Ruta | Rol | Puerto (compose) |
|---|---|---|---|
| **api-gestion-medica** (este repo) | `tesis/api-gestion-medica` | NestJS: usuarios, RBAC, pacientes, médicos, citas, historias, recetas, archivos, registro de análisis de mamografía | 8008 |
| app-gestion-medica | `tesis/app-gestion-medica` | Frontend Angular | 8007 |
| detector-cancer-de-mama | `tesis/detector-cancer-de-mama` | FastAPI + TensorFlow (ResNet50V2), `POST /predict` | 8009 → 8501 |

**Dato clave:** el backend **no llama al detector**. El frontend llama al detector y después envía el resultado al backend para guardarlo (ver §9).

---

## 2. Stack y versiones

Versiones instaladas según `package-lock.json` (el rango de `package.json` entre paréntesis cuando difiere).

| Componente | Versión | Uso |
|---|---|---|
| Node (Docker) | `node:20-slim` | Runtime (`Dockerfile`) |
| NestJS core/common | 11.0.10 (^11.0.1) | Framework, adaptador Express |
| TypeScript | 5.7.3 | — |
| TypeORM / `@nestjs/typeorm` | 0.3.20 / ^11.0.0 | ORM PostgreSQL |
| pg | 8.13.3 | Driver PostgreSQL |
| `@nestjs/jwt` / passport-jwt | 11.0.0 / ^4.0.1 | JWT (la estrategia Passport existe pero no se usa, ver hallazgos) |
| bcrypt | ^5.1.1 | Hash de contraseñas (costo 10) |
| redis (node-redis) | ^4.7.1 | Sesiones (`REDIS_SESSION_CLIENT`) |
| cache-manager + cache-manager-redis-store | ^7.2.4 / ^3.0.1 | Caché manual en servicios |
| bullmq / `@nestjs/bullmq` / bull-board | 5.63.0 / ^11.0.4 / ^6.14.1 | Cola `emailQueue` + panel |
| `@nestjs/throttler` | ^6.4.0 | Rate limiting global |
| class-validator / class-transformer | 0.14.1 / ^0.5.1 | Validación de DTO |
| joi | 18.0.1 | Validación de `.env` |
| dicom-parser / sharp | 1.8.21 / 0.34.5 | Conversión DICOM → JPEG, procesamiento de imágenes |
| fluent-ffmpeg | ^2.1.3 | Validación de video |
| `@nestjs/swagger` | ^11.2.6 | OpenAPI en `/api` (solo `development`) |
| hbs | ^4.2.0 | Vistas de Logs UI y login de Bull Board |
| Jest / ts-jest | ^29.7.0 / ^29.2.5 | Pruebas (8 specs de plantilla) |

Base de datos: PostgreSQL (el servicio está comentado en `docker-compose.yml`; se asume externo). Redis 7 en compose (puerto host 8010).

---

## 3. Mapa de carpetas

```
src/
├── main.ts                    # bootstrap: vistas hbs, CORS, Swagger, pipes, interceptor, filtro, guards, Bull Board
├── app.module.ts              # Config, Cache (Redis), Throttler, ServeStatic /uploads, TypeORM, módulos de negocio
├── configuration/             # configuration.ts (factory) + validation.ts (Joi)
├── database/                  # conexión nombrada DB_MAIN + SchemaInitService (crea esquemas y sincroniza)
├── auth/                      # login/refresh/logout/me, guards, decoradores, cifrado de módulos
├── permission/  role/  menu/  # RBAC: permisos × menús × roles
├── user/                      # User (public.users) y UserSecurity (seguridad.users)
├── common-person/             # datos personales compartidos (persona_comun)
├── patient/  doctors/  medical-center/  departments/
├── medical-appointments/      # hub de citas (1294 líneas en el service)
├── medical-history/  recipe/  # historia clínica y recetas
├── mammography-analysis/      # registro/bandeja/revisión de resultados del detector
├── files/                     # subidas, streaming, DICOM, videos
├── parameters/                # 10 catálogos (controllers/, services/, entities/, dto/)
├── dashboard/                 # estadísticas
├── logs/                      # error_log + Logs UI (hbs)
├── queues/                    # BullMQ + Bull Board
├── redis-session/             # cliente Redis de sesiones (global)
├── email/                     # EmailModule — NO importado en AppModule
├── crypto/                    # utilidades encrypt/decrypt/hash expuestas por HTTP
├── health/                    # terminus: ping DB + heap
└── common/                    # adaptadores (date, http, pdf, excel, xml, crypto, uuid), filtro, interceptores, AuthContextService
```

No existen `src/migrations`, `test/` ni archivos `.sql` en el repositorio.

---

## 4. Arquitectura y patrones (lo que hace el código)

**Estilo:** monolito modular NestJS en **capas** (Controller → Service → `Repository<T>` de TypeORM). No es hexagonal: los servicios inyectan repositorios TypeORM directamente y no hay puertos/interfaces de dominio. Las entidades TypeORM son a la vez modelo de dominio y de persistencia.

| Patrón | Dónde | Nota |
|---|---|---|
| Módulos por feature | `src/*/*.module.ts` | Un módulo por agregado de negocio |
| Repository (TypeORM) | `@InjectRepository(X, DB_MAIN)` en todos los services | Conexión nombrada = nombre de la BD (`database/DatabaseConnectionName.ts:4-6`) |
| DTO + class-validator | `*/dto/*.ts`; `ValidationPipe({ transform, whitelist })` | Registrado dos veces: `main.ts:88` y `APP_PIPE` en `app.module.ts:124-131` |
| Guards globales encadenados | `main.ts:103-107` | `JwtAuthGuard` → `SessionGuard` → `PermissionsGuard`, más `ThrottlerGuard` como `APP_GUARD` |
| Decoradores de metadatos | `auth/decorators/` | `@Public()`, `@Permission('slug.accion')`, `@GetUser('campo')` |
| Interceptor de respuesta | `common/interceptors/HttpResponse.interceptor.ts` | Envuelve en `{ code, data }`; si ya trae `data`, hace spread |
| Filtro global de excepciones | `common/exceptions/HttpExceptionFilter.ts` | `@Catch()` todo, guarda en `auditoria.error_log`, responde `{ data: null, error, statusCode }` |
| Adapter | `common/*-adapter/` | Envoltorios de moment, axios, pdfkit, exceljs, xml2js, crypto |
| Caché manual | 18 services con `CACHE_MANAGER` | Claves tipo `patient:query:{json}` + lista de claves para invalidar |
| Soft delete manual | columna `deleted_at` + `IsNull()` en consultas | No se usa `@DeleteDateColumn` |
| Filtro por médico ("IDOR") | `common/services/auth-context.service.ts`, services de paciente/cita/historia/receta/dashboard | Si el usuario tiene perfil de doctor, se restringen listados; los admins se detectan por nombre de rol |
| Transacciones | Solo `user/user.service.ts:100` y `:382` (`QueryRunner`) | El resto de flujos multi-tabla no son atómicos |

### Flujo de una petición

```
Express (cookie-parser, json 350mb)
  → ThrottlerGuard (APP_GUARD) + JwtAuthGuard → SessionGuard (Redis) → PermissionsGuard (BD)
  → ValidationPipe → Controller → Service → Repository (PostgreSQL) / Cache (Redis)
  → HttpResponseInterceptor → { code, data }
  (error) → HttpExceptionFilter → error_log + { data:null, error, statusCode }
```

Fuera de este pipeline: `ServeStaticModule` en `/uploads` (`app.module.ts:81-88`) y el router de Bull Board montado con `app.use('/admin/queues', …)` (`main.ts:114`).

---

## 5. Mapa de módulos

| Módulo | Ruta base | Responsabilidad |
|---|---|---|
| Auth | `/auth` | Login (usuario normal o de sistema), refresh, logout, sesión, `/me` con módulos cifrados |
| User / UserSecurity | `/users`, `/users-security` | CRUD de usuarios de `public.users` y `seguridad.users` (comparten permiso `user.*`) |
| Role / Permission / Menu | `/roles`, `/permissions`, `/menu` | RBAC: permisos asignados a rol por menú (`seguridad.permisos_menus`) |
| CommonPerson | `/common-persons` | Datos personales reutilizados por usuario, paciente y médico |
| Patient | `/patient` | Pacientes + alergias, enfermedades crónicas, medicamentos (M:N) |
| Doctors | `/doctors` | Médicos, horarios (`doctor_schedules`), centros y especialidades |
| MedicalCenter / Departments | `/medical-centers`, `/departments` | Centros, departamentos, asignación de médicos |
| MedicalAppointments | `/medical-appointments` | Disponibilidad, creación (con alta automática de paciente, `resolvePatient` l.214), ciclo de vida, finalizar consulta |
| MedicalHistory | `/medical-history` | Historia clínica por consulta, diagnóstico, cancelación |
| Recipe | `/recipes` | Recetas e ítems, dispensar, cancelar |
| MammographyAnalysis | `/mammography-analyses` | Guarda resultados del detector, bandeja del día, ranking, estadísticas, revisión médica |
| Files | `/files` | Subidas (base64 y multipart), streaming, conversión DICOM, videos |
| Parameters | `/allergies`, `/chronic-diseases`, `/medications`, `/specialties`, `/civil-status`, `/gender`, `/identity-document`, `/state`, `/municipality`, `/parish` | Catálogos |
| Dashboard | `/dashboard` | Estadísticas filtradas por médico |
| Logs | `/logs` | Consulta de `error_log` y Logs UI |
| Queues / BullBoard | `/admin` | Cola `emailQueue` y panel |
| Health | `/health` | Ping a BD + heap < 150 MB |
| Crypto | `/crypto` | Utilidades de cifrado/hash por HTTP |
| Email | (`/email`) | **No montado**: `EmailModule` no se importa en `AppModule` |

---

## 6. Modelo de datos

- **Motor:** PostgreSQL, una conexión (`DB_MAIN`), `autoLoadEntities: true`, `synchronize: false` en la conexión **pero** `SchemaInitService` (`database/schema-init.service.ts:17-26`) crea los esquemas `seguridad, parametro, selfManagement, public, auditoria` y ejecuta `dataSource.synchronize()` en cada arranque. No hay migraciones.
- **PK:** UUID en todas las tablas, salvo `auditoria.error_log` (entero autoincremental).
- **Borrado lógico:** columna `deleted_at` manual en casi todas las tablas.
- **Cifrado en reposo:** ninguno. No hay `transformer` en ninguna columna. Las contraseñas se guardan con bcrypt desde los services.

### Esquemas y tablas

| Esquema | Tablas |
|---|---|
| `public` | `users`, `persona_comun`, `common_person_images`, `patients` (+ `patient_allergies`, `patient_chronic_diseases`, `patient_medications`), `doctors` (+ `medical_centers_doctors`, `doctors_specialties`, `departments_doctors`), `doctor_images`, `doctor_schedules`, `medical_appointments`, `medical_histories`, `recipes`, `recipe_items`, `appointment_files`, `mammography_analyses` |
| `parametro` | `medical_centers`, `medical_center_images`, `departments` (+ `department_specialties`), `specialties`, `allergies`, `chronic_diseases`, `medications`, `estado_civil`, `genero`, `documento_identidad`, `estado`, `municipio`, `parroquia`, `video_publicidad` |
| `seguridad` | `users` (UserSecurity), `roles`, `permisos`, `menu`, `permisos_menus` |
| `auditoria` | `error_log` |
| `selfManagement` | (vacío: se crea pero ninguna entidad lo usa) |

### Relaciones principales

```
Role 1─N User / UserSecurity
User 1─1 CommonPerson           (users.common_person_id)  ⚠ también persona_comun.user_id
CommonPerson N─1 IdentityDocument (letra)
Patient N─1 CommonPerson (unique) ; Patient M─N Allergy / ChronicDisease / Medication
Doctor 1─1 CommonPerson ; Doctor M─N MedicalCenter / Specialty / Department ; Doctor 1─N DoctorSchedule
MedicalCenter N─1 Parish ; MedicalCenter 1─N Department ; Department M─N Specialty
MedicalAppointment N─1 Patient, Doctor (CASCADE) ; N─1 Specialty, MedicalCenter, Department (SET NULL)
MedicalAppointment 1─1 MedicalHistory (medical_histories.medical_appointment_id)
MedicalAppointment 1─N Recipe ; Recipe 1─N RecipeItem ; Recipe N─1 MedicalHistory
MedicalAppointment 1─N AppointmentFile
MammographyAnalysis N─1 MedicalAppointment, AppointmentFile, Patient, User(analyzed_by)  (todas SET NULL)
PermissionMenu = Permission × Menu × Role
State 1─N Municipality 1─N Parish
```

Únicos declarados: `users.name`, `users.email`, `doctors.license_number`, `patients.common_person_id`, `patients.patient_code`, `medical_appointments.appointment_number`, `medical_histories.consultation_number`, `recipes.recipe_number`, `name` en alergias/enfermedades/medicamentos/especialidades, `documento_identidad.letra`. Índices: `mammography_analyses(created_at)`, `mammography_analyses(appointment_id)`, `error_log(exception_type, route, user_id)`.

---

## 7. Autenticación y permisos

### Login y sesión

1. `POST /auth/login` (`@Public`) con `{ credential, password, isSystemUser }`. Busca por `email` o `name` en `public.users` o en `seguridad.users` y compara con bcrypt (`auth/auth.service.ts:49-91`).
2. Firma `access_token` (`JWT_SECRET`, `JWT_EXPIRES_IN`, por defecto 1h) y `refresh_token` (`JWT_REFRESH_SECRET`, por defecto 7d). El payload es `{ id, user: { id, user: <usuario sin password> } }`.
3. Guarda la sesión en Redis bajo `session:{userId}` con TTL fijo de 3600 s. Una sola sesión por usuario: un nuevo login reemplaza la anterior.
4. `POST /auth/refresh` (`@Public`) exige que el refresh coincida con el guardado en Redis y rota ambos tokens.
5. `GET /auth/me` devuelve `{ id, name, email, doctorId, modules }`, donde `modules` va cifrado AES-256-CBC (`auth/utils/permissions-cipher.util.ts`). La clave está también en el frontend (`app-gestion-medica/src/app/core/utils/permissions-cipher.util.ts:1`).

### Cadena de guards (global, `main.ts:103-107`)

| Orden | Guard | Qué hace | Error |
|---|---|---|---|
| — | `ThrottlerGuard` (`APP_GUARD`) | Límites `short` 100/1s, `medium` 20/10s, `long` 100/60s | 429 |
| 1 | `JwtAuthGuard` | Token desde `Authorization: Bearer` o cookie `access_token`; verifica con `JWT_SECRET` | 403 sin token, 401 inválido |
| 2 | `SessionGuard` | `session:{id}` existe y su `access_token` es idéntico al presentado | 401 |
| 3 | `PermissionsGuard` | Si el handler no declara `@Permission`, **deja pasar**. Si declara, carga el rol (primero en `seguridad.users`, luego en `public.users`) con `permissionMenus` y exige al menos uno de `menu.slug + '.' + permiso.nombre` | 403 |

`@Public()` omite los tres guards de autenticación (no el throttler).

### Acciones y slugs

- Acciones (`permission/permission.const.ts`): `CREATE='crear'`, `VIEW='consultar'`, `UPDATE='actualizar'`, `DELETE='eliminar'`. `UPLOAD`, `ASSIGN` y `DIAGNOSTICAR` son alias de `'crear'`.
- Slugs de módulo (`menu/menu.const.ts`): `user, role, permission, logs, parameters, menu, file, email, crypto, patient, medical-center, doctors, common-person, medical-history, recipe, departments, appointments, mammography-analysis`.
- Filtro por médico: `AuthContextService.getDoctorIdForUser` resuelve `User → CommonPerson → Doctor`. Los services consideran admin a quien tenga un rol cuyo nombre contenga `admin` o `super` (p. ej. `doctors/doctors.service.ts:65-72`).

---

## 8. Tabla de endpoints

Notación: `P(slug.accion)` = `@Permission(...)` con los valores reales. "Autenticado" = sin `@Permission`, basta JWT + sesión. No hay prefijo global ni versionado: las rutas cuelgan de la raíz y Swagger vive en `/api`.

### Auth, usuarios y RBAC

| Método | Ruta | Guard / permiso | Propósito |
|---|---|---|---|
| POST | /auth/login | Público | Login, crea sesión Redis |
| POST | /auth/refresh | Público | Rota tokens |
| POST | /auth/logout | Autenticado | Borra sesión y cookie |
| GET | /auth/session | Autenticado | ¿Sesión activa? |
| GET | /auth/me | Autenticado | Usuario + módulos cifrados + centros |
| POST/GET | /users | P(user.crear) / P(user.consultar) | Crear / listar |
| GET/PATCH/DELETE | /users/:id | P(user.consultar / actualizar / eliminar) | Detalle / editar / borrar |
| POST/GET | /users-security | P(user.crear) / P(user.consultar) | Usuarios de sistema |
| GET/PATCH/DELETE | /users-security/:id | P(user.consultar / actualizar / eliminar) | — |
| POST/GET | /roles | P(role.crear) / P(role.consultar) | — |
| GET/PATCH/DELETE | /roles/:id | P(role.consultar / actualizar / eliminar) | — |
| POST/GET | /menu | P(menu.crear) / P(menu.consultar) | — |
| GET/PATCH/DELETE | /menu/:id | P(menu.consultar / actualizar / eliminar) | — |
| GET | /permissions/me | Autenticado (+ `@UseGuards(JwtAuthGuard, SessionGuard)`) | Permisos propios |
| GET | /permissions/user/:userId | P(permission.consultar) | Permisos de un usuario |
| GET | /permissions/role/:roleId | P(permission.consultar) | Permisos de un rol |
| GET | /permissions | P(permission.consultar) | Declarado dos veces (l.134 y l.349) |
| GET/PATCH/DELETE | /permissions/:id | P(permission.consultar / actualizar / eliminar) | — |
| POST | /permissions/assign | P(permission.crear) | Asignar permiso a rol |
| DELETE | /permissions/revoke | P(permission.eliminar) | Revocar (body en DELETE) |
| POST | /permissions/bulk-update | P(permission.actualizar) | Actualización masiva de rol |
| POST | /permissions/bulk-assign/role | P(permission.crear) | Masivo a rol |
| POST | /permissions/bulk-assign/role/multiple-modules | P(permission.crear) | Masivo a rol, varios módulos |
| POST | /permissions/bulk-assign/user | P(permission.crear) | Masivo a usuario |
| POST | /permissions/bulk-assign/user/multiple-modules | P(permission.crear) | Masivo a usuario, varios módulos |
| POST | /permissions/assign-to-role | P(permission.crear) | Reemplaza todos los permisos del rol |
| POST | /permissions/roles/:roleId/assign-all | P(permission.crear) | Asigna todos los permisos activos |
| POST | /permissions/cache/invalidate/role/:roleId | P(permission.eliminar) | Invalida caché |
| POST | /permissions/cache/invalidate/user/:userId | P(permission.eliminar) | Invalida caché |

### Dominio clínico

| Método | Ruta | Guard / permiso | Propósito |
|---|---|---|---|
| POST/GET | /common-persons | P(common-person.crear / consultar) | — |
| GET/PATCH/DELETE | /common-persons/:id | P(common-person.consultar / actualizar / eliminar) | — |
| POST | /patient | P(patient.crear) | Crear paciente |
| GET | /patient | P(patient.consultar) | Listar (filtrado por médico) |
| GET | /patient/by-document | P(patient.consultar) | `?documentNumber&letter` |
| GET | /patient/:id | P(patient.consultar) | Detalle (sin filtro por médico) |
| PATCH/DELETE | /patient/:id | P(patient.actualizar / eliminar) | — |
| POST/GET | /doctors | P(doctors.crear / consultar) | — |
| GET/PATCH/DELETE | /doctors/:id | P(doctors.consultar / actualizar / eliminar) | — |
| POST | /doctors/schedules | P(doctors.actualizar) | Configurar horarios |
| GET | /doctors/:doctorId/schedules | P(doctors.consultar) | `?medicalCenterId&includeInactive` |
| PATCH/DELETE | /doctors/schedules/:blockId | P(doctors.actualizar / eliminar) | Bloque de horario |
| POST/GET | /medical-centers | P(medical-center.crear / consultar) | — |
| GET/PATCH/DELETE | /medical-centers/:id | P(medical-center.consultar / actualizar / eliminar) | — |
| GET | /medical-centers/:id/images | P(medical-center.consultar) | — |
| POST | /medical-centers/:id/assign-doctor/:doctorId | P(medical-center.actualizar) | `?departmentId` |
| DELETE | /medical-centers/:id/remove-doctor/:doctorId | P(medical-center.actualizar) | — |
| POST/GET | /departments | P(departments.crear / consultar) | — |
| GET/PATCH/DELETE | /departments/:id | P(departments.consultar / actualizar / eliminar) | — |
| GET | /medical-appointments/availability | P(appointments.consultar) | Disponibilidad de médico |
| GET | /medical-appointments/available-dates | P(appointments.consultar) | Días disponibles |
| GET | /medical-appointments/patient/:patientId/history | P(appointments.consultar) | Citas de un paciente |
| GET | /medical-appointments/doctor/:doctorId/schedule | P(appointments.consultar) | Agenda |
| POST | /medical-appointments | P(appointments.crear) | Crear cita (puede crear paciente) |
| GET | /medical-appointments | P(appointments.consultar) | Listar |
| GET/PATCH/DELETE | /medical-appointments/:id | P(appointments.consultar / actualizar / eliminar) | — |
| PATCH | /medical-appointments/:id/cancel | P(appointments.actualizar) | Cancelar |
| PATCH | /medical-appointments/:id/complete | P(appointments.actualizar) | Completar |
| PATCH | /medical-appointments/:id/finish-consultation | P(appointments.crear) (`DIAGNOSTICAR`) | Crea historia + receta y cierra cita |
| POST/GET | /medical-history | P(medical-history.crear / consultar) | — |
| GET | /medical-history/:id | P(medical-history.consultar) | — |
| GET | /medical-history/patient/:patientId | P(medical-history.consultar) | — |
| PATCH | /medical-history/:id | P(medical-history.actualizar) | — |
| POST | /medical-history/review | P(medical-history.actualizar) | Agregar diagnóstico |
| PATCH | /medical-history/:id/cancel | P(medical-history.actualizar) | Cancelar consulta |
| DELETE | /medical-history/:id | P(medical-history.eliminar) | Borrado lógico |
| POST | /recipes | **P(recipe.consultar)** | Crear receta |
| GET | /recipes, /recipes/:id | P(recipe.consultar) | — |
| GET | /recipes/patient/:patientId | P(recipe.consultar) | — |
| GET | /recipes/medical-history/:medicalHistoryId | P(recipe.consultar) | — |
| PATCH | /recipes/:id, /:id/dispense, /:id/cancel | P(recipe.actualizar) | — |
| DELETE | /recipes/:id | P(recipe.eliminar) | — |
| POST | /mammography-analyses | P(mammography-analysis.crear) | Guardar resultado del detector (multipart, 300 MB) |
| GET | /mammography-analyses/inbox | P(mammography-analysis.consultar) | Bandeja agrupada por cita |
| GET | /mammography-analyses/recent | P(mammography-analysis.consultar) | Ranking paginado |
| GET | /mammography-analyses/stats/daily | P(mammography-analysis.consultar) | Totales del día |
| GET | /mammography-analyses/appointment/:appointmentId | P(mammography-analysis.consultar) | Por cita |
| PATCH | /mammography-analyses/:id/review | P(mammography-analysis.actualizar) | Marcar revisado |
| GET | /mammography-analyses/:id/image | P(mammography-analysis.consultar) | Stream de imagen |
| GET | /mammography-analyses/:id | P(mammography-analysis.consultar) | Detalle |
| GET | /dashboard/stats, /recent-appointments, /appointments-by-status, /appointments-by-month | Autenticado | Estadísticas |

### Archivos

| Método | Ruta | Guard / permiso | Propósito |
|---|---|---|---|
| POST | /files/upload-base64 | P(file.crear) | Guarda base64 con el nombre enviado |
| GET | /files/download-url/:name | P(file.consultar) | URL pública |
| POST | /files/video-base64, /files/video | P(file.crear) | Video (25 MB, mp4) |
| GET | /files/video/:id | P(file.consultar) | Stream |
| POST | /files/appointment-upload | P(file.crear) | Imagen de cita (300 MB) en `uploads/{userId}/{centerId}/{appointmentId}/` |
| GET | /files/appointment-files | P(file.consultar) | `?appointmentId` |
| GET | /files/appointment-files/:fileId | P(file.consultar) | Stream |
| POST | /files/profile-photo, /medical-center-photo, /common-person-photo, /doctor-photo, /common-person-image | P(file.crear) | Fotos (5 MB) |
| GET | /files/profile-photos/:ownerId/:filename | P(file.consultar) | Stream |
| GET | /files/medical-center-photos/:medicalCenterId/:filename | P(file.consultar) | Stream |
| GET | /files/common-person-photos/:personId/:filename | P(file.consultar) | Stream |
| GET | /files/medical-center-images/:imageId, /doctor-images/:imageId, /common-person-images/:imageId | P(file.consultar) | Stream |
| DELETE | /files/medical-center-images/:imageId | P(file.eliminar) | 204 |
| POST | /files/dicom-convert | P(file.consultar) | DICOM → JPEG por frame (300 MB) |
| GET | /uploads/** | **Sin guard** (ServeStaticModule) | Archivos físicos |

### Catálogos

| Método | Ruta | Guard / permiso |
|---|---|---|
| POST/GET, GET/PATCH/DELETE `:id` | /allergies, /chronic-diseases, /medications | P(parameters.crear / consultar / actualizar / eliminar) |
| POST/GET, GET/PATCH/DELETE `:id` | /specialties | **Autenticado, sin `@Permission`** |
| GET, GET `:id` | /civil-status, /gender, /identity-document, /municipality, /parish, /state | Público |
| GET | /state/:id/municipalities | Público |

### Operación y utilidades

| Método | Ruta | Guard / permiso | Propósito |
|---|---|---|---|
| GET | /health | Autenticado (no es `@Public`) | Ping BD + heap |
| GET | /logs | P(logs.crear) | Listar logs |
| GET | /logs/:id | P(logs.consultar) | Detalle |
| GET | /logs/ui/view | Público + verificación manual de JWT y rol | Vista HTML |
| GET | /logs/ui/api | Autenticado, sin rol ni permiso | Logs en JSON para la vista |
| GET | /logs/ui/login | Público | Vista login |
| GET/POST | /admin/login | Público | Login de Bull Board (cookie `access_token`) |
| GET | /admin/queues, /admin/queues/* | Autenticado + chequeo manual de rol | Panel (además montado como middleware Express en `main.ts:114`) |
| POST | /crypto/validate-hash, /decrypt, /encrypt, /hash | P(crypto.crear) | Utilidades criptográficas |

---

## 9. Integración con el detector de cáncer de mama

```
Angular ── POST {apiUrlMachineLearning}/predict (multipart file) ──► FastAPI detector (8009→8501)
   │            ◄── { prediction: MALIGNO|BENIGNO, probability, label, status }
   │   normaliza a MALIGNANT/BENIGN (ml.service.ts)
   └── POST /mammography-analyses (multipart) ──► NestJS ──► mammography_analyses + uploads/
        campos: file | appointmentFileId, prediction, probability, status, label,
                rawResponseJson, appointmentId, patientId, sourceFileName
```

| Aspecto | Detalle | Evidencia |
|---|---|---|
| Quién llama al modelo | El frontend, no el backend | `app-gestion-medica/src/app/core/services/machine-learning/ml.service.ts:32-37`; el backend no tiene cliente HTTP hacia el detector |
| URL | `environment.apiUrlMachineLearning = http://localhost:8009` | `app-gestion-medica/src/environments/environment*.ts:4` |
| Contrato del detector | `POST /predict` (campo `file`), `GET /health` | `detector-cancer-de-mama/main.py:42-96` |
| Preproceso | RGB, 224×224, sin normalización explícita | `main.py:55-60` |
| Regla de decisión | salida `p` ≤ 0.15 → MALIGNO con `probability=(1-p)*100`; si no, BENIGNO con `probability=p*100` | `main.py:74-89` |
| Autenticación del detector | Ninguna (el header `authorization` se recibe y no se usa); CORS `*` | `main.py:34-47` |
| Persistencia | El backend guarda lo que envía el cliente; valida enum, rango 0-100 y MIME (png/jpeg/webp) | `mammography-analysis/dto/create-mammography-analysis.dto.ts:58-108`, `mammography-analysis.service.ts:56-143` |
| Imagen | Nueva en `uploads/mammography-analyses/{appointmentId|standalone}/`, o reutiliza `appointment_files.file_path` | `mammography-analysis.service.ts:67-110` |
| DICOM | El backend convierte DICOM → JPEG (`POST /files/dicom-convert`) para que el cliente lo envíe al detector | `files/dicom-converter.service.ts` |
| Orden clínico | Malignos por probabilidad DESC, benignos por probabilidad ASC | `mammography-analysis.service.ts:482-502` |

---

## 10. Configuración, ejecución, esquema y pruebas

### Variables de entorno (validadas con Joi, `configuration/validation.ts`)

| Obligatorias | Con valor por defecto |
|---|---|
| `DB_HOST`, `REDIS_HOST`, `REDIS_SESSION_HOST`, `JWT_SECRET`, `EMAIL_HOST`, `TOKEN_VALIDATOR` | `NODE_ENV=development`, `PORT=7008`, `URL_HOST=localhost`, `TZ=America/Caracas`, `DB_PORT=5432`, `DB_USER=postgres`, `DB_PASS=123456`, `DB_NAME=bd_gestion_medica`, `REDIS_PORT=6379`, `REDIS_SESSION_PORT=6379`, `REDIS_SESSION_PASS=''`, `JWT_EXPIRES_IN=1h`, `EMAIL_PORT=1025`, `CACHE_TTL=3600`, `CACHE_MAX=1000`, `BULL_BOARD_PORT=9999` |

Leídas con `process.env` sin validar: `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, `PERMISSIONS_SECRET`, `UPLOADS_PATH` (por defecto `uploads`), `CORS_ORIGIN`, `JWTKEY_VALIDATOR`, `APP_VERSION`.

### Ejecutar

```bash
npm ci                    # node_modules no está instalado en esta copia
cp .env.example .env      # completar valores
npm run dev               # nest start --watch
# Swagger: http://localhost:<PORT>/api  (solo NODE_ENV=development)
# Docker: docker compose up --build  (API 8008, Redis 8010, ML 8009, front 8007)
```

`docker-compose.yml` construye el front y el detector desde `../portal-usuario/gestion-medica` y `../machine-learning/detector-cancer-de-mama`, que no coinciden con la estructura actual de la carpeta `tesis/`.

### Esquema / "migraciones"

- No hay migraciones ni CLI de TypeORM configurado.
- Al arrancar, `SchemaInitService` crea los esquemas y ejecuta `synchronize()`: el esquema se deriva de las entidades en cada inicio, en cualquier ambiente.
- Los catálogos y el RBAC no tienen seeder en el repositorio.

### Pruebas

- `npm test` (Jest, `rootDir: src`, `*.spec.ts`).
- Hay 8 specs (`logs`, `crypto`, `files`×2, `menu`×2, `patient`×2), todos plantilla de Nest CLI (`should be defined`) y sin mocks de los repositorios que inyectan.
- `npm run test:e2e` apunta a `./test/jest-e2e.json`, que no existe.
- En este análisis no se ejecutaron: `node_modules` no está instalado.
