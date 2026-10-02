# Arquitectura Backend — Proyecto API Gestión Médica

**Última actualización:** Octubre 2026

## Índice

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura General](#arquitectura-general)
3. [Estructura de Carpetas](#estructura-de-carpetas)
4. [Base de Datos](#base-de-datos)
5. [Flujo de Migraciones](#flujo-de-migraciones)
6. [Autenticación y Seguridad](#autenticación-y-seguridad)
7. [Sistema de Permisos (RBAC)](#sistema-de-permisos-rbac)
8. [Módulos/Features](#módulos-features)
9. [Gestión de Archivos](#gestión-de-archivos)
10. [Colas de Tareas (BullMQ)](#colas-de-tareas-bullmq)
11. [Patrones de Arquitectura](#patrones-de-arquitectura)
12. [Configuración y Entorno](#configuración-y-entorno)
13. [Flujos Clave](#flujos-clave)
14. [Dependencias Externas](#dependencias-externas)
15. [Guía para Desarrolladores](#guía-para-desarrolladores)

---

## Resumen Ejecutivo

**API Gestión Médica** es un backend REST construido con **NestJS 11** que gestiona:

- 🏥 Clínicas/centros médicos, departamentos, especialidades
- 👥 Pacientes, médicos, usuarios del sistema (con vínculo a centros médicos)
- 📋 Citas médicas, consultas, historial clínico, recetas
- 🧠 Análisis de mamografías: el backend envía la imagen al servicio detector y guarda el resultado
- 🔐 Autenticación JWT con sesiones Redis; los permisos viajan ofuscados a `/auth/me`
- 💾 PostgreSQL con esquemas `public`, `seguridad`, `parametro`, `auditoria` (más `selfManagement`, creado vacío); esquema de tablas gestionado por migraciones TypeORM
- 📁 Almacenamiento local de archivos con procesamiento (WebP, DICOM), servido solo por endpoints protegidos
- 🗃️ Caché en Redis (`cache-manager` 7 + Keyv) con invalidación por registro de claves
- 🎯 Rate limiting, validación global, logging centralizado

**Stack técnico:**
- NestJS 11 + Express adapter
- TypeORM 0.3.20 + PostgreSQL
- Redis con contraseña (caché, colas BullMQ y sesiones)
- `@nestjs/jwt` (sin Passport) + `bcrypt` 6
- BullMQ + Bull Board (panel; no hay jobs en producción)
- Sharp (procesamiento de imágenes) + FFmpeg (validación de video) + `dicom-parser`
- Handlebars (vistas para logs y Bull Board)

---

## Arquitectura General

### Concepto: Módulos NestJS con DI

```
main.ts (bootstrap)
├── app.module.ts (root)
│   ├── AuthModule
│   ├── UserModule
│   ├── PatientModule
│   ├── DoctorModule
│   ├── MedicalAppointmentsModule (hub central del negocio)
│   ├── MedicalHistoryModule
│   ├── RecipeModule
│   ├── RoleModule / PermissionModule
│   ├── MedicalCenterModule
│   ├── ParametersModule (10 catálogos)
│   ├── FilesModule
│   ├── DashboardModule
│   ├── MammographyAnalysisModule
│   └── ... (25+ módulos en total)
│
└── Global Guards (cadena, registrados con app.useGlobalGuards en main.ts):
    1️⃣ JwtAuthGuard     (verifica token)
    2️⃣ SessionGuard     (verifica Redis + usuario activo)
    3️⃣ PermissionsGuard (verifica permisos)
    + ThrottlerGuard como APP_GUARD (app.module.ts)
```

### Flujo de una Petición HTTP

```
REQUEST → NestJS Router
    ↓
Middleware (cors, cookie-parser, body-parser 30 MB)
    ↓
ThrottlerGuard (rate limiting)
    ↓
1️⃣ JwtAuthGuard (verifica @Public())
    ↓
2️⃣ SessionGuard (valida sesión Redis)
    ↓
3️⃣ PermissionsGuard (valida @Permission())
    ↓
Controller (endpoint handler)
    ↓
Service (lógica de negocio)
    ↓
Database (TypeORM query)
    ↓
HttpResponseInterceptor (estandariza respuesta)
    ↓
RESPONSE ({ code, data })
    ↓
[Error] → HttpExceptionFilter → log BD + respuesta estándar
```

---

## Estructura de Carpetas

```
src/
├── main.ts                  ← Bootstrap: vistas, body limit, CORS, Swagger (dev), guards globales, Bull Board
├── app.module.ts            ← Root module: imports, ValidationPipe (APP_PIPE), ThrottlerGuard (APP_GUARD), caché
│
├── auth/                    # Autenticación JWT
│   ├── auth.controller.ts
│   ├── auth.service.ts      # login, refreshTokens, logout, getUserWithPermissions
│   ├── auth.const.ts        # JwtUserPayload { id, roleId, name }
│   ├── decorators/          # @Public(), @Permission(), @GetUser()
│   ├── dto/
│   ├── guards/              # JwtAuthGuard, SessionGuard, PermissionsGuard
│   ├── interfaces/
│   ├── services/            # PanelAccessService (Bull Board y vista de logs)
│   └── utils/               # permissions-cipher.util.ts (ofuscación AES-256-CBC)
│
├── common/                  # Transversal utilities
│   ├── common.module.ts
│   ├── cache/               # cache.config.ts, cache-registry.ts, permission-cache.ts
│   ├── sequence/            # next-code.ts (códigos APT-/CONS-/REC-/PAC-)
│   ├── exceptions/          # HttpExceptionFilter
│   ├── interceptors/        # HttpResponseInterceptor
│   ├── services/            # AuthContextService, UserAccessService
│   └── *-adapter/           # crypto, date, excel, http, pdf, xml, uuid
│
├── configuration/           # Config global + validation
│   ├── configuration.ts     # configFactory()
│   └── validation.ts        # Joi validation (lista autoritativa de variables)
│
├── database/                # TypeORM
│   ├── getMainConnection.ts # Conexión principal (synchronize: false)
│   ├── data-source.ts       # DataSource del CLI de migraciones
│   ├── migrations/          # Migraciones TypeORM (cada una con up y down)
│   └── schema-init.service.ts # Solo crea los esquemas faltantes al arrancar
│
├── user/                    # Usuarios del sistema
│   ├── user.controller.ts   # CRUD /users
│   ├── user.service.ts      # Con transacciones
│   ├── user-centers.ts      # Vínculo usuario ↔ centros (users_medical_centers)
│   ├── user.module.ts
│   └── entities/            # User (public.users), UserSecurity (seguridad.users), UserMedicalCenter
│
├── common-person/           # Base compartida User/Patient/Doctor
│   └── common-person.entity.ts # persona_comun
│
├── patient/                 # Pacientes
│   ├── patient.controller.ts
│   ├── patient.service.ts   # IDOR protection
│   └── patient.entity.ts
│
├── doctors/                 # Médicos + horarios
│   ├── doctors.controller.ts
│   ├── doctors.service.ts
│   ├── doctor-schedule.service.ts
│   └── entities/            # Doctor, DoctorSchedule, DoctorImage
│
├── medical-appointments/    # Citas (HUB CENTRAL)
│   ├── medical-appointments.controller.ts  # 12 endpoints
│   ├── medical-appointments.service.ts    # finish-consultation
│   └── medical-appointment.entity.ts
│
├── medical-history/         # Historial clínico
│   ├── medical-history.controller.ts
│   ├── medical-history.service.ts
│   └── medical-history.entity.ts          # Signos vitales, diagnóstico
│
├── recipe/                  # Recetas médicas
│   ├── recipe.controller.ts
│   ├── recipe.service.ts
│   └── entities/            # Recipe, RecipeItem
│
├── role/                    # Roles de usuario
│   ├── role.controller.ts
│   ├── role.service.ts
│   └── role.entity.ts
│
├── permission/              # Permisos RBAC + CASL
│   ├── permission.controller.ts
│   ├── permission.service.ts      # Motor central de permisos
│   ├── entities/            # Permission, PermissionMenu
│   └── constants/           # permission.const.ts, menu.const.ts
│
├── medical-center/          # Centros médicos
│   ├── medical-center.controller.ts
│   ├── medical-center.service.ts
│   └── entities/            # MedicalCenter, MedicalCenterImage
│
├── departments/             # Departamentos
│   ├── departments.controller.ts
│   ├── departments.service.ts
│   └── department.entity.ts
│
├── parameters/              # Catálogos del sistema (10 subentidades)
│   ├── parameters.module.ts
│   ├── controllers/         # SpecialtyController, AllergyController, ...
│   ├── services/            # SpecialtyService, AllergyService, ...
│   └── entities/            # Specialty, Allergy, ChronicDisease, ...
│
├── files/                   # Gestión de archivos
│   ├── files.controller.ts  # 20+ endpoints
│   ├── files.service.ts     # Sharp + FFmpeg
│   ├── dicom-converter.service.ts
│   ├── upload-limits.ts     # @FileUpload(), topes de tamaño, almacenamiento temporal
│   └── entities/            # AppointmentFile, VideoPublicity
│
├── mammography-analysis/    # Análisis ML de mamografías
│   ├── mammography-analysis.controller.ts # 9 endpoints
│   ├── mammography-analysis.service.ts
│   ├── detector/            # DetectorClient (HTTP al servicio detector)
│   └── entities/            # MammographyAnalysis (public.mammography_analyses)
│
├── queues/                  # BullMQ + Bull Board
│   ├── queues.module.ts     # Registra emailQueue (sin productor ni worker)
│   ├── queues.service.ts
│   └── bull-board/
│
├── redis-session/           # Sesiones en Redis
│   └── redis-session.service.ts
│
├── dashboard/               # Estadísticas
│   ├── dashboard.controller.ts  # 4 endpoints
│   └── dashboard.service.ts
│
├── logs/                    # Sistema de logging
│   ├── logs.controller.ts
│   ├── logs.service.ts
│   ├── entities/            # ErrorLog (auditoria.error_logs)
│   └── views/               # Vistas Handlebars
│
├── health/                  # Health checks
│   └── health.controller.ts # GET /health (Terminus, @Public)
│
├── menu/                    # Menús de navegación
│   ├── menu.controller.ts
│   ├── menu.service.ts
│   └── menu.entity.ts
│
└── crypto/                  # Encriptación
    └── crypto.service.ts    # AES, hash, etc.
```

---

## Base de Datos

### Información General

- **ORM:** TypeORM v0.3.20
- **Base de datos:** PostgreSQL (multiples esquemas)
- **Conexión:** Única, nombrada `DB_MAIN` (definida en `DatabaseConnectionName`)
- **autoLoadEntities:** true (carga automática desde decoradores)
- **Esquema de tablas:** lo gestionan las migraciones TypeORM de `src/database/migrations/` (ver [Flujo de Migraciones](#flujo-de-migraciones)). La conexión usa `synchronize: false`.
- **`SchemaInitService`:** en `onApplicationBootstrap()` solo ejecuta `CREATE SCHEMA IF NOT EXISTS` para `seguridad`, `parametro`, `selfManagement`, `public` y `auditoria`. No crea ni altera tablas.
- **Producción (contenedor):** el `CMD` del `Dockerfile` ejecuta `npm run migration:run:prod` antes de `node dist/main.js`; si una migración falla, el contenedor no arranca.

### Schemas y sus Entidades

| Schema | Propósito | Tablas |
|--------|-----------|--------|
| `public` | Datos clínicos | users, users_medical_centers, persona_comun, common_person_images, patients, doctors, doctor_schedules, doctor_images, medical_appointments, medical_histories, recipes, recipe_items, appointment_files, mammography_analyses |
| `seguridad` | Autenticación y RBAC | users (UserSecurity), roles, permisos, permisos_menus, menu |
| `parametro` | Catálogos e infraestructura | medical_centers, medical_center_images, departments, specialties, allergies, chronic_diseases, medications, genero, estado_civil, documento_identidad, estado, municipio, parroquia, video_publicidad |
| `auditoria` | Logs de errores | error_log (registro centralizado de excepciones) |

**Secuencias** (`public`): `seq_appointment_number`, `seq_consultation_number`, `seq_recipe_number`, `seq_patient_code` (migración `1790500000000-CodeSequences`). Ver [Códigos legibles](#códigos-legibles-apt-cons-rec-pac).

### Entidades Principales

#### CommonPerson (esquema public)

Entidad base compartida por User, Patient y Doctor:

```
id (uuid)
letter (char 1) — tipo documento: V, E, J, P, etc.
documentNumber (varchar 30)
firstName, middleName, lastName, secondLastName
phoneNumber
isActive (boolean)
photoUrl (opcional)
createdAt, updatedAt, deletedAt (soft delete)
Relaciones:
  — @OneToOne User (usuario del sistema)
  — @ManyToOne IdentityDocument
  — @OneToMany CommonPersonImage
```

#### User (esquema public)

```
id (uuid)
name — username (único entre usuarios no borrados: UQ_users_name_active)
email (único entre usuarios no borrados: UQ_users_email_active)
password (hashed with bcrypt)
roleId (FK → seguridad.roles)
status (boolean)
firstLogin (boolean)
createdAt, updatedAt, deletedAt
Relaciones:
  — @OneToOne CommonPerson (common_person_id)
  — @ManyToOne Role
```

#### UserMedicalCenter (esquema public, tabla `users_medical_centers`)

Vincula a personal que **no es médico** con los centros médicos donde trabaja (los médicos siguen usando la relación Doctor ↔ MedicalCenter). Creada por la migración `1790466956646-UsersMedicalCenters`.

```
id (uuid)
user_id (FK → public.users, ON DELETE CASCADE)
medical_center_id (FK → parametro.medical_centers, ON DELETE RESTRICT)
created_by (uuid, nullable)
created_at (timestamp, default now())
deleted_at (timestamp, nullable) — borrado lógico del vínculo
Índice único parcial: UQ_users_medical_centers_active (user_id, medical_center_id) WHERE deleted_at IS NULL
```

- `UserService` reemplaza el conjunto de centros con `replaceUserCenters()` (`src/user/user-centers.ts`): borra lógicamente los que salen y crea los nuevos.
- `GET /auth/me` devuelve en `medicalCenters` la **unión** de los centros del perfil de médico y los de `users_medical_centers`, sin duplicados.

#### UserSecurity (esquema seguridad)

Usuarios administrativos del sistema:
```
id, name, email, password, roleId, status, createdAt, updatedAt, deletedAt
Relaciones:
  — @ManyToOne Role
```

#### Patient (esquema public)

```
id (uuid)
commonPersonId (FK → persona_comun, unique)
patientCode (varchar 20, unique) — "PAC-2026-00001" (secuencia seq_patient_code)
maritalStatus, occupation
emergencyContactName, emergencyContactPhone, emergencyContactRelationship
bloodType (varchar 5, texto libre: no hay catálogo), insuranceCompany, insurancePolicyNumber
isActive (boolean)
createdAt, updatedAt, deletedAt
Relaciones:
  — @ManyToOne CommonPerson
  — @ManyToMany Allergy
  — @ManyToMany ChronicDisease
  — @ManyToMany Medication
```

#### Doctor (esquema public)

```
id (uuid)
commonPersonId (FK → persona_comun, unique)
licenseNumber (unique)
isActive (boolean)
createdAt, updatedAt, deletedAt
Relaciones:
  — @OneToOne CommonPerson
  — @ManyToMany MedicalCenter
  — @ManyToMany Specialty
  — @ManyToMany Department
  — @OneToMany DoctorSchedule
  — @OneToMany DoctorImage
```

#### DoctorSchedule (esquema public)

Bloques horarios del médico:
```
id (uuid)
doctorId, medicalCenterId, departmentId (FKs)
dayOfWeek (0-6), startTime, endTime (time)
maxPatientsPerSlot (int)
isActive, createdAt, updatedAt, deletedAt
```

#### MedicalAppointment (esquema public)

Hub central de citas:
```
id (uuid)
appointmentNumber (unique) — "APT-2026-00001"
patientId, doctorId, specialtyId, medicalCenterId, departmentId (FKs)
appointmentDate (timestamp), durationMinutes (int, default 30)
status: PENDING | CONFIRMED | IN_CONSULTATION | COMPLETED | CANCELLED
type: FIRST_VISIT | FOLLOW_UP | EMERGENCY
reason, observations, cancellationReason (text)
isActive, createdAt, updatedAt, deletedAt
Relaciones:
  — @ManyToOne Patient
  — @ManyToOne Doctor
  — @ManyToOne Specialty
  — @ManyToOne MedicalCenter
  — @ManyToOne Department
  — @OneToOne MedicalHistory (opcional)
  — @OneToMany Recipe
  — @OneToMany AppointmentFile
```

#### MedicalHistory (esquema public)

```
id (uuid)
consultationNumber (unique) — "CONS-2026-00001"
patientId, doctorId, medicalCenterId, specialtyId, appointmentId? (FKs)
consultationDate (timestamp)
reasonForVisit, symptoms, physicalExamination
— Signos vitales:
  bloodPressure, heartRate, temperature (decimal 4.1), 
  weight (decimal 5.2), height (decimal 5.2), 
  respiratoryRate, oxygenSaturation (decimal 5.2)
— Diagnóstico:
  diagnosis (text), diagnosisCode (varchar, ej: A00), 
  treatmentPlan (text), observations
— Seguimiento:
  followUpDate (date nullable), followUpNotes
status: 'in_progress' | 'completed' | 'cancelled'
createdAt, updatedAt, deletedAt
```

#### Recipe (esquema public)

```
id (uuid)
recipeNumber (unique) — "REC-2026-00001"
issueDate (timestamp), expiryDate? (timestamp)
diagnosis, generalInstructions, notes
status: 'active' | 'dispensed' | 'expired' | 'cancelled'
medicalHistoryId, patientId, doctorId, appointmentId? (FKs)
createdAt, updatedAt, deletedAt
Relaciones:
  — @OneToMany RecipeItem (cascade)
  — @ManyToOne Patient, Doctor, MedicalHistory
```

#### RecipeItem

```
id (uuid)
recipeId (FK)
medicationId? (FK → medicamentos)
medicationName (varchar)
dosage, frequency, duration?, quantity
instructions? (text)
```

#### MedicalCenter (esquema parametro)

```
id (uuid)
name, address, phone, email
parishId (FK → parroquias)
numBeds, numOperatingRooms (int)
hasEmergency, hasHospitalization, hasIntensiveCare (boolean)
hasParking, hasPharmacy, hasLaboratory (boolean)
imageUrl? (legacy), isActive, createdAt, updatedAt, deletedAt
Relaciones:
  — @ManyToMany Doctor
  — @ManyToOne Parish
  — @OneToMany Department
  — @OneToMany MedicalCenterImage
```

#### Department (esquema parametro)

```
id (uuid)
name, description?
medicalCenterId (FK)
isActive, createdAt, updatedAt, deletedAt, createdBy, updatedBy
Relaciones:
  — @ManyToOne MedicalCenter
  — @ManyToMany Specialty
  — @ManyToMany Doctor
```

#### Role (esquema seguridad)

```
id (uuid)
name (unique)
isActive, createdAt, updatedAt, deletedAt
Relaciones:
  — @OneToMany User
  — @OneToMany UserSecurity
  — @OneToMany PermissionMenu
```

#### Permission (esquema seguridad)

```
id (uuid)
name (ej: 'crear', 'consultar', 'actualizar', 'eliminar')
displayName, order?, isRequired, controlType?
isActive, createdAt, updatedAt, deletedAt
Relaciones:
  — @OneToMany PermissionMenu
```

#### PermissionMenu (esquema seguridad) — **TABLA PUENTE CRÍTICA**

Relaciona Role + Menu + Permission:

```
id (uuid)
permissionId (FK → permissions)
menuId (FK → menus)
roleId (FK → roles)
isActive, fieldSize?, createdAt, updatedAt, deletedAt
```

**Uso:** Un permiso efectivo se expresa como `{menu.slug}.{permission.name}`, ej: `"patient.crear"`, `"appointments.consultar"`.

#### Menu (esquema seguridad)

```
id (uuid)
name, slug, icon, path, parentId? (FK → menus, para árbol)
order (int), isActive, createdAt, updatedAt, deletedAt
Relaciones:
  — @OneToMany Menu (recursión padre-hijo)
  — @OneToMany PermissionMenu
```

#### MammographyAnalysis (esquema public, tabla `mammography_analyses`)

Una fila por cada ejecución del detector; pueden coexistir varias para la misma cita o archivo.

```
id (uuid)
appointment_id, appointment_file_id, patient_id (uuid, nullable; FKs ON DELETE SET NULL)
analyzed_by (uuid, nullable; FK → public.users) — null si el usuario no existe en public.users
prediction (varchar 20): MALIGNANT | BENIGN
probability (numeric 5,2) — confianza del modelo en la clase predicha (0-100)
malignancy_probability (numeric 5,2, nullable) — probabilidad de malignidad (0-100)
raw_score (double precision, nullable) — salida cruda de la sigmoide (0-1)
threshold (double precision, nullable), model_version (varchar 100, nullable)
status (varchar 20): danger | success
label (varchar 255, nullable), raw_response (jsonb, nullable) — cuerpo del detector, para auditoría
notes (text, nullable)
image_path (varchar 500), image_mime_type, source_file_name
is_reviewed (boolean, default false), reviewed_by, reviewed_at, review_notes
created_at, updated_at, deleted_at
Índices: idx_mammography_analyses_created_at, idx_mammography_analyses_appointment
```

---

## Flujo de Migraciones

El esquema de tablas vive en `src/database/migrations/`. El CLI usa el `DataSource` de `src/database/data-source.ts`, que lee la conexión con el mismo `configFactory()` de la app y registra las migraciones en la tabla `migrations`.

| Comando | Uso |
|---------|-----|
| `npm run migration:generate -- src/database/migrations/<Nombre>` | Genera una migración a partir de la diferencia entre las entidades y la BD |
| `npm run migration:run` | Aplica las migraciones pendientes (ts-node, desarrollo) |
| `npm run migration:revert` | Revierte la última migración aplicada (ejecuta su `down`) |
| `npm run migration:show` | Lista las migraciones y si están aplicadas |
| `npm run migration:run:prod` | Aplica las migraciones compiladas (`dist/database/data-source.js`); lo ejecuta el `CMD` del contenedor |

**Procedimiento al cambiar una entidad:**

1. Modificar la entidad (`*.entity.ts`).
2. Generar: `npm run migration:generate -- src/database/migrations/<NombreDescriptivo>`.
3. Revisar el SQL generado: que solo contenga el cambio esperado y que el `down` lo deshaga por completo. **Toda migración tiene `down`.** Las migraciones que mueven datos se escriben a mano y lo indican en su nombre.
4. Aplicar: `npm run migration:run`.
5. Comprobar que no queda deriva (*drift*) entre entidades y BD:

   ```bash
   npm run typeorm -- migration:generate src/database/migrations/DriftCheck --dryrun --check
   ```

   Debe responder `No changes in database schema were found`. Si genera SQL, falta una migración o la entidad no coincide con la BD.

---

## Autenticación y Seguridad

### Stack Criptográfico

- **Contraseñas:** Hashing con `bcrypt` v6
- **JWT:** `@nestjs/jwt` v11, verificado directamente por `JwtAuthGuard` (no se usa Passport)
- **Permisos:** el bloque `modules` de `/auth/me` va cifrado con AES-256-CBC como **ofuscación**, no como control de seguridad (ver [Ofuscación de Permisos](#ofuscación-de-permisos))
- **Sesiones:** Almacenadas en Redis; el TTL es la vida restante del refresh token

### Payload del JWT

Access token y refresh token llevan el mismo payload mínimo (`JwtUserPayload` en `src/auth/auth.const.ts`), más `iat`/`exp`:

```json
{ "id": "<uuid>", "roleId": "<uuid | null>", "name": "<username | null>" }
```

No incluyen email, datos personales ni el objeto de usuario. Se firman con `JWT_SECRET` (access, `JWT_EXPIRES_IN`, por defecto `1h`) y `JWT_REFRESH_SECRET` (refresh, `JWT_REFRESH_EXPIRES_IN`, por defecto `7d`).

### Flujo de Login

```
1. POST /auth/login { credential, password, isSystemUser }   (@Public)
   ↓
2. AuthService.login()
   — isSystemUser=true  → validateSystemUser() sobre seguridad.users
   — isSystemUser=false → validateUser() sobre public.users
   — Busca por email o name, solo usuarios activos (status=true) y no borrados
   — bcrypt.compare() siempre se ejecuta (contra un hash ficticio si el usuario no existe)
   — Usuario inexistente, cuenta o rol inactivo, o clave errónea → 401 "Credenciales inválidas"
   ↓
3. signTokens({ id, roleId, name }) genera:
   — access_token (JWT_SECRET, JWT_EXPIRES_IN, default 1h)
   — refresh_token (JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN, default 7d)
   ↓
4. RedisSessionService.setSession() — reemplaza la sesión previa (single-session)
   con TTL = segundos restantes hasta el exp del refresh_token
   ↓
5. Respuesta: { access_token, refresh_token }
```

### Guards en Cadena Global

Registrados en `main.ts` en orden específico. **Todos los guards se aplican globalmente** excepto si la ruta tiene `@Public()`.

**Guard 1 — JwtAuthGuard** (`src/auth/guards/jwt-auth.guard.ts`)

```typescript
// Verifica @Public() vía reflector
if (metadataPublic) return true;  // Bypass completo

// Extrae token desde:
// 1. Header: Authorization: Bearer <token>
// 2. Cookie: access_token

if (!token) throw new UnauthorizedException('Token requerido para esta petición'); // 401

// Verifica con JwtService.verify(token, { secret: JWT_SECRET })
// Si es válido: req.user = payload ({ id, roleId, name }) y req.accessToken = token
// Si es inválido o expiró: UnauthorizedException (401)
```

**Guard 2 — SessionGuard** (`src/auth/guards/session.guard.ts`)

Se ejecuta **después** de JwtAuthGuard. Verifica que la sesión sea válida en Redis y que el usuario siga activo.

```typescript
// RedisSessionService.isValidSessionToken(userId, accessToken):
// lee `session:<userId>` y exige que access_token coincida con el token presentado

// Si la sesión expiró, fue reemplazada por otro login o cerrada (logout): 401

// UserAccessService.resolve(userId): usuario y rol leídos de la BD en cada petición;
// usuario o rol inactivo/borrado → 401. El resultado queda en req.userAccess.
```

**Guard 3 — PermissionsGuard** (`src/auth/guards/permission.guard.ts`)

Se ejecuta **tercero**. Valida permisos específicos via `@Permission()`.

```typescript
// Lee permisos requeridos del decorador:
// @Permission('patient.crear') o varios (basta uno)

// Reutiliza req.userAccess (o llama UserAccessService.resolve):
// permisos activos del rol en formato `{menu.slug}.{permission.name}`, en minúsculas

// Sin rol o inactivo → 401; sin ninguno de los permisos requeridos → ForbiddenException (403)
```

**`UserAccessService`** (`src/common/services/user-access.service.ts`) es la fuente única de rol, estado y permisos para los guards, los paneles HTML y la detección de administrador. Busca primero en `seguridad.users` y luego en `public.users`. Usuario y rol se leen siempre de la BD; solo la lista de permisos del rol se cachea (ver [Caché de permisos](#caché-de-permisos)).

### Decoradores

**@Public()**
```typescript
// Marca una ruta como pública — exenta de TODOS los guards
@Controller('auth')
export class AuthController {
  @Post('login')
  @Public()  // bypass JwtAuthGuard, SessionGuard, PermissionsGuard
  login(@Body() dto: LoginUserDto) { ... }
}
```

**@Permission(...)**
```typescript
// Define permisos requeridos — evaluado por PermissionsGuard
@Post('patients')
@Permission('patient.crear')  // requiere este permiso exacto
create(@Body() dto: CreatePatientDto) { ... }

// O múltiples (OR logic)
@Get('patients')
@Permission('patient.consultar', 'appointments.consultar')  // al menos uno
getAll() { ... }
```

**@GetUser(...)**
```typescript
// Extrae datos del usuario del request
@Get('me')
getProfile(@GetUser() user: User) { ... }

@Patch(':id')
update(@GetUser('id') userId: string, @Body() dto: UpdateDto) { ... }
```

### Gestión de Sesiones en Redis

Cada usuario tiene una sola clave, `session:<userId>`, cuyo valor es un JSON (`auth.service.ts`, `login()` y `refreshTokens()`):

```json
{
  "access_token": "<jwt>",
  "refresh_token": "<jwt>",
  "userId": "<uuid>",
  "roleId": "<uuid>",
  "loginAt": "2026-10-01T12:00:00.000Z"
}
```

Tras un refresh, `loginAt` se sustituye por `refreshedAt`. Un login nuevo borra la sesión anterior (single-session): el access token previo deja de pasar `SessionGuard`.

**TTL:** igual a la vida restante del refresh token, calculada desde su `exp` (`sessionTtlSeconds()`); con el valor por defecto `JWT_REFRESH_EXPIRES_IN=7d`, una semana. No existe una variable de TTL de sesión propia. El cliente Redis de sesión se conecta a `REDIS_SESSION_HOST`/`REDIS_SESSION_PORT` con `REDIS_SESSION_PASS` o, si está vacía, `REDIS_PASSWORD`.

### Refresh Token

```
POST /auth/refresh { refreshToken }   (@Public)
    ↓
AuthService.refreshTokens()
    — Verifica la firma con JWT_REFRESH_SECRET → si falla, 401
    — Lee session:<id>; exige que exista y que refresh_token coincida exactamente → si no, 401
    — Relee usuario y rol; si están inactivos o borrados, borra la sesión y responde 401
    — Firma un par nuevo (access + refresh) con payload { id, roleId, name }
    — Reescribe la sesión con TTL = vida del nuevo refresh token
    ↓
Respuesta: { access_token, refresh_token }
```

### Ofuscación de Permisos

`GET /auth/me` devuelve `{ id, name, email, doctorId, modules }`, donde `modules` (permisos, menús y `medicalCenters`) es un string `"<iv hex>:<datos hex>"`:

- **Backend:** `encryptModules()` en `src/auth/utils/permissions-cipher.util.ts` usa `crypto.createCipheriv('aes-256-cbc', ...)` de Node, con un IV aleatorio por respuesta. La clave sale de la variable `PERMISSIONS_SECRET`; si no está definida, el código usa una clave fija interna. La variable no figura en `validation.ts`.
- **Frontend:** descifra con `crypto.subtle` (AES-CBC).

> **Esto es ofuscación, no un control de seguridad.** La clave tiene que estar en el bundle del frontend para descifrar, así que cualquiera con acceso a la app puede leer el contenido. La autorización real la aplican `SessionGuard` y `PermissionsGuard` en cada petición; ocultar o mostrar opciones de menú en el cliente no protege ningún endpoint.

---

## Sistema de Permisos (RBAC)

### Conceptos Clave

- **Role:** Grupo de permisos (ej: "Doctor", "Admin", "Paciente")
- **Permission:** Acción individual (ej: "crear", "consultar", "actualizar")
- **Menu:** Módulo del sistema (ej: "Pacientes", "Citas", "Médicos")
- **PermissionMenu:** Tabla puente que relaciona Role + Menu + Permission

### Estructura

```
Role (1)
  ↓ (M)
PermissionMenu (puente)
  ↓ (M) — M
  ├─→ Permission ("crear", "consultar", ...)
  └─→ Menu ("Pacientes", "Citas", ...)
```

**Permiso efectivo = `{menu.slug}.{permission.name}`**

Ejemplo:
```
Role: "Doctor"
  PermissionMenu { menu.slug: "patient", permission.name: "crear" }
    → Permiso: "patient.crear"
  
  PermissionMenu { menu.slug: "appointments", permission.name: "consultar" }
    → Permiso: "appointments.consultar"
  
  PermissionMenu { menu.slug: "mammography-analysis", permission.name: "actualizar" }
    → Permiso: "mammography-analysis.actualizar"
```

**Alcance de administrador:** un usuario con el permiso `security.consultar` (`ADMIN_SCOPE_PERMISSION` en `src/common/services/user-access.service.ts`) ve todos los registros; no se decide por el nombre del rol.

### PermissionService — El Motor del Sistema

Ubicado en `src/permission/permission.service.ts`. Funcionalidades:

| Método | Descripción |
|--------|-------------|
| `getAbilityForUser(userId)` | Carga abilities CASL del usuario (cache Redis 1h) |
| `getUserPermissions(userId)` | Retorna permisos planos + reglas CASL + árbol de menús |
| `getMenusForUserAndRole(userId)` | Construye árbol recursivo de menús permitidos |
| `assignPermissionToRole(roleId, permissionId, menuId)` | Asigna permiso a rol (reactive si estaba soft-deleted) |
| `revokePermissionFromRole(roleId, permissionId, menuId)` | Revoca permiso (soft delete) |
| `bulkUpdateRolePermissions(dto)` | Actualiza múltiples permisos en lote |
| `bulkAssignPermissionsToRoleById(roleId, permissionIds)` | Asigna varios permisos por ID |
| `bulkAssignMultipleModulesPermissionsToRoleById(dto)` | Asigna/revoca permisos de múltiples módulos |
| `assignAllPermissionsToRole(roleId)` | Asigna TODOS los permisos activos a un rol |

**Cache:** Invalidación selectiva por rol, por usuario, o global (ver [Caché de permisos](#caché-de-permisos)).

### Caché de permisos

`src/common/cache/permission-cache.ts` define claves con **generación**: `permission:g<gen>:<scope>`, donde `<gen>` se lee de la clave `permission:generation` (0 si no existe). TTL de cada entrada: 1 h (`PERMISSION_CACHE_TTL = 60 * 60_000` ms).

| Scope | Lo escribe | Contenido |
|-------|-----------|-----------|
| `access:role:<roleId>` | `UserAccessService` (guards y paneles) | Lista de permisos `slug.accion` del rol |
| `role:<roleId>:permissions` | `PermissionService` | Permisos del rol |
| `user:<userId>:ability` | `PermissionService` | Abilities CASL del usuario |

- **Cambio de grants de un rol** (asignar/revocar): `invalidateRoleCache()` borra los scopes de ese rol, incluido `access:role:<roleId>`.
- **Activar/desactivar o editar una acción de permiso, o editar/borrar un menú:** `invalidateAllPermissions()` escribe una generación nueva; todas las claves anteriores quedan huérfanas y expiran solas.
- Usuario y rol (estado activo/borrado) **no** se cachean: se leen de la BD en cada petición.

### Acciones Estándar

En `permission.const.ts` (varias acciones comparten valor):

```typescript
enum PermissionActionsMenu {
  CREATE = 'crear',
  UPLOAD = 'crear',
  ASSIGN = 'crear',
  VIEW = 'consultar',
  UPDATE = 'actualizar',
  DELETE = 'eliminar',
  DIAGNOSTICAR = 'crear',   // finish-consultation exige appointments.crear
}
```

### Módulos del Sistema

En `src/menu/menu.const.ts` (valor = `menu.slug`):

```typescript
enum ModuleItemsMenu {
  UserModule                = 'user',
  UserSecurityModule        = 'user-security',
  AuthModule                = 'auth',
  RoleModule                = 'role',
  PermissionModule          = 'permission',
  LogsModule                = 'logs',
  QueuesModule              = 'queues',
  BullBoardModule           = 'bullboard',
  RedisSessionModule        = 'redis-session',
  HealthModule              = 'health',
  ParametersModule          = 'parameters',
  MenuModule                = 'menu',
  FilesModule               = 'file',
  EmailModule               = 'email',      // slug heredado; el módulo de email ya no existe
  CryptoModule              = 'crypto',
  PatientModule             = 'patient',
  MedicalCenterModule       = 'medical-center',
  DoctorsModule             = 'doctors',
  CommonPersonModule        = 'common-person',
  MedicalHistoryModule      = 'medical-history',
  RecipeModule              = 'recipe',
  DepartmentsModule         = 'departments',
  MedicalAppointmentsModule = 'appointments',
  MammographyAnalysisModule = 'mammography-analysis',
}
```

---

## Módulos/Features

### Auth (`src/auth/`)

**Controladores:**
- `AuthController`: `POST /auth/login` (@Public), `POST /auth/refresh` (@Public), `POST /auth/logout`, `GET /auth/session`, `GET /auth/me`
- `ProfileController` (`src/user/profile.controller.ts`, también bajo `/auth`): `GET /auth/profile`, `PATCH /auth/me`, `PATCH /auth/change-password`

**Servicios:**
- `AuthService` — login, logout, refresh, verificación de sesión, `getUserWithPermissions()` para `/auth/me`
- `PermissionService` — permisos y árbol de menús del usuario
- `PanelAccessService` — autoriza Bull Board y la vista de logs (JWT + sesión + permiso) fuera del pipeline de guards

**DTOs:**
```typescript
LoginUserDto { credential, password, isSystemUser }
RefreshTokenDto { refreshToken }
```

---

### User (`src/user/`)

**Controladores:**
- `UserController` — CRUD `/users` con permisos
- `UserSecurityController` — (usuarios administrativos)

**Servicios:**
- `UserService` — CRUD de usuarios regulares (schema public)
- `UserSecurityService` — CRUD de superadmins (schema seguridad)

| Método HTTP | Ruta | Permiso | Descripción |
|-------------|------|---------|-------------|
| POST | `/users` | `user.crear` | Crear usuario |
| GET | `/users` | `user.consultar` | Listar con paginación |
| GET | `/users/:id` | `user.consultar` | Obtener por ID |
| PATCH | `/users/:id` | `user.actualizar` | Actualizar |
| DELETE | `/users/:id` | `user.eliminar` | Soft delete |

**Lógica especial:**
- `create()` usa transacción (QueryRunner): crea/reutiliza CommonPerson → crea User → vincula centros (`medicalCenterIds` → `users_medical_centers`) → opcionalmente crea Doctor
- `update()` escribe `users` y `persona_comun` en una sola transacción; si desactiva al usuario, revoca su sesión antes de escribir
- `remove()` soft delete en transacción (QueryRunner): `deletedAt = now`, `status = false`
- Cache Redis para queries (alcance `user`)

---

### Patient (`src/patient/`)

**Controlador**: `PatientController` — `/patient/*`

| Método HTTP | Ruta | Permiso |
|-------------|------|---------|
| POST | `/patient` | `patient.crear` |
| GET | `/patient` | `patient.consultar` |
| GET | `/patient/:id` | `patient.consultar` |
| GET | `/patient/by-document?documentNumber=V&letter=12345678` | — |
| PATCH | `/patient/:id` | `patient.actualizar` |
| DELETE | `/patient/:id` | `patient.eliminar` |

**Características:**
- **IDOR Protection**: Si el usuario es médico y no tiene alcance de administrador, `findAll()` y `findOne()` se limitan a pacientes con citas de ese médico (ver [IDOR](#idor-insecure-direct-object-reference-protection))
- Genera código único desde la secuencia `seq_patient_code`: `PAC-<YYYY>-<NNNNN>`
- `create()` escribe persona y paciente en una transacción
- Soft delete: `deletedAt` + `isActive = false`
- Relaciona con Allergy, ChronicDisease, Medication (M:N)

---

### Doctor (`src/doctors/`)

**Controlador**: `DoctorsController` — `/doctors/*`

| Método HTTP | Ruta | Descripción |
|-------------|------|-------------|
| POST | `/doctors` | Crear doctor |
| GET | `/doctors` | Listar médicos |
| GET | `/doctors/:id` | Detalle |
| PATCH | `/doctors/:id` | Actualizar |
| DELETE | `/doctors/:id` | Soft delete |
| POST | `/doctors/schedules` | Crear bloque horario |
| GET | `/doctors/:doctorId/schedules` | Horarios del doctor |
| PATCH | `/doctors/schedules/:blockId` | Actualizar bloque |
| DELETE | `/doctors/schedules/:blockId` | Borrar bloque |

**Entidades:**
- `Doctor` — datos personales + licencia
- `DoctorSchedule` — bloques horarios por día/centro/departamento
- `DoctorImage` — fotos de perfil (con campo `isActive` para histórico)

**Relaciones:**
- M:N con MedicalCenter, Specialty, Department
- O:M con DoctorSchedule, DoctorImage

---

### MedicalAppointments (`src/medical-appointments/`) — **HUB CENTRAL**

**Controlador**: `MedicalAppointmentsController` — `/medical-appointments/*`

| Método HTTP | Ruta | Permiso | Descripción |
|-------------|------|---------|-------------|
| GET | `/medical-appointments/availability` | — | Slots ocupados |
| GET | `/medical-appointments/available-dates` | — | Días con cupos |
| GET | `/medical-appointments/patient/:patientId/history` | `appointments.consultar` | Historial paciente |
| GET | `/medical-appointments/doctor/:doctorId/schedule` | `appointments.consultar` | Agenda doctor |
| POST | `/medical-appointments` | `appointments.crear` | Crear cita |
| GET | `/medical-appointments` | `appointments.consultar` | Listar |
| GET | `/medical-appointments/:id` | `appointments.consultar` | Detalle |
| PATCH | `/medical-appointments/:id` | `appointments.actualizar` | Actualizar |
| PATCH | `/medical-appointments/:id/cancel` | `appointments.actualizar` | Cancelar |
| PATCH | `/medical-appointments/:id/complete` | `appointments.actualizar` | Marcar completada |
| **PATCH** | **`/medical-appointments/:id/finish-consultation`** | **`appointments.crear`** | **CREA HISTORIAL + RECETA** |
| DELETE | `/medical-appointments/:id` | `appointments.eliminar` | Soft delete |

**Endpoint crítico: `PATCH /medical-appointments/:id/finish-consultation`**

Recibe `CompleteConsultationDto`:
```typescript
{
  observations?: string;
  medicalHistory: {
    reasonForVisit: string;
    symptoms: string;
    physicalExamination: string;
    bloodPressure: string;
    heartRate: number;
    temperature: decimal;
    weight: decimal;
    height: decimal;
    respiratoryRate: number;
    oxygenSaturation: decimal;
    diagnosis: string;
    diagnosisCode: string;
    treatmentPlan: string;
    followUpDate?: date;
  };
  recipe?: {
    generalInstructions?: string;
    items: [{
      medicationId?: uuid;
      medicationName: string;
      dosage: string;
      frequency: string;
      duration?: string;
      quantity: number;
      instructions?: string;
    }];
  };
}
```

**Acciones en una transacción** (`dataSource.transaction`, `finishConsultation()` en `medical-appointments.service.ts`):
0. Antes de abrirla, valida que existan los `medicationId` de la receta (un id inválido no escribe nada)
1. Bloquea la cita (`pessimistic_write`) y rechaza si ya está `COMPLETED`
2. Crea `MedicalHistory` con signos vitales, diagnóstico (`historyService.create(..., manager)`)
3. Crea `Recipe` con ítems, si se proporciona (`recipeService.create(..., manager)`)
4. Actualiza `MedicalAppointment.status = COMPLETED`
5. Tras el commit, limpia las cachés de historial, receta y cita; responde con la cita completa (`loadFullAppointment`)

Si algo falla, no queda historial ni receta escrita y el reintento puede completarse.

**Números de cita:** `appointmentNumber` sale de la secuencia `seq_appointment_number` (`APT-<YYYY>-<NNNNN>`). Si la cita crea un paciente nuevo, su código sale de `seq_patient_code`.

---

### MedicalHistory (`src/medical-history/`)

**Controlador**: `MedicalHistoryController` — `/medical-history/*`

| Método HTTP | Ruta | Descripción |
|-------------|------|-------------|
| POST | `/medical-history` | Iniciar consulta |
| GET | `/medical-history` | Listar |
| GET | `/medical-history/:id` | Obtener por ID |
| GET | `/medical-history/patient/:patientId` | Historial del paciente |
| PATCH | `/medical-history/:id` | Actualizar |
| POST | `/medical-history/review` | Agregar diagnóstico |
| PATCH | `/medical-history/:id/cancel` | Cancelar |
| DELETE | `/medical-history/:id` | Soft delete |

**Almacena:**
- Datos de consulta: fecha, número (`CONS-<YYYY>-<NNNNN>`, secuencia `seq_consultation_number`), motivo, síntomas, examen físico
- Signos vitales completos: TA, FC, T°, peso, talla, FR, SatO2
- Diagnóstico con código CIE-10
- Plan de tratamiento
- Seguimiento recomendado

---

### Recipe (`src/recipe/`)

**Controlador**: `RecipeController` — `/recipes/*`

| Método HTTP | Ruta | Descripción |
|-------------|------|-------------|
| POST | `/recipes` | Crear receta |
| GET | `/recipes` | Listar |
| GET | `/recipes/:id` | Detalle |
| GET | `/recipes/patient/:patientId` | Recetas del paciente |
| GET | `/recipes/medical-history/:medicalHistoryId` | Recetas del historial |
| PATCH | `/recipes/:id` | Actualizar |
| PATCH | `/recipes/:id/dispense` | Marcar como despachada |
| PATCH | `/recipes/:id/cancel` | Cancelar |
| DELETE | `/recipes/:id` | Soft delete |

**Estados:** `active`, `dispensed`, `expired`, `cancelled`

**Número:** `REC-<YYYY>-<NNNNN>` (secuencia `seq_recipe_number`). `create()` escribe cabecera e ítems en una transacción (o en la del llamador, como `finishConsultation`); `update()` reemplaza cabecera e ítems en una sola transacción.

---

### Role & Permission (`src/role/`, `src/permission/`)

**Rol:**

| Método HTTP | Ruta | Descripción |
|-------------|------|-------------|
| POST | `/roles` | Crear rol |
| GET | `/roles` | Listar |
| GET | `/roles/:id` | Detalle con permisos |
| PATCH | `/roles/:id` | Actualizar |
| DELETE | `/roles/:id` | Soft delete |

**Permisos:**

| Método HTTP | Ruta | Descripción |
|-------------|------|-------------|
| POST | `/permissions` | Crear permiso |
| GET | `/permissions` | Listar |
| POST | `/permissions/assign-to-role` | Asignar permiso a rol |
| PATCH | `/permissions/:id` | Actualizar |
| DELETE | `/permissions/:id` | Borrar |

---

### MedicalCenter (`src/medical-center/`)

**Controlador**: `MedicalCenterController` — `/medical-centers/*`

| Método HTTP | Ruta |
|-------------|------|
| POST | `/medical-centers` |
| GET | `/medical-centers` |
| GET | `/medical-centers/:id` |
| PATCH | `/medical-centers/:id` |
| DELETE | `/medical-centers/:id` |

**Entidades:**
- `MedicalCenter` — datos del centro
- `MedicalCenterImage` — fotos (WebP, con histórico `isActive`)

**Listado:** `doctorCount` y `departmentCount` se calculan en SQL con `loadRelationCountAndMap`, excluyendo médicos y departamentos borrados lógicamente (`deletedAt IS NULL`).

**Relaciones:**
- M:N con Doctor
- O:M con Department
- O:M con MedicalCenterImage
- M:1 con Parish

---

### Department (`src/departments/`)

**Controlador**: `DepartmentsController` — `/departments/*`

| Método HTTP | Ruta |
|-------------|------|
| POST | `/departments` |
| GET | `/departments` |
| GET | `/departments/:id` |
| PATCH | `/departments/:id` |
| DELETE | `/departments/:id` |

**Relaciones:**
- M:1 con MedicalCenter
- M:N con Specialty, Doctor

---

### Parameters (`src/parameters/`) — 10 Catálogos

Módulo que agrupa controladores/servicios de parámetros del sistema:

| Entidad | Tabla | CRUD |
|---------|-------|------|
| Specialty | parametro.specialties | Sí |
| Allergy | — | Sí |
| ChronicDisease | — | Sí |
| Medication | — | Sí |
| Gender | — | Sí |
| CivilStatus | — | Sí |
| IdentityDocument | — | Sí |
| State | parametro.states | Sí |
| Municipality | parametro.municipalities | Sí |
| Parish | parametro.parishes | Sí |

Cada uno tiene su controlador y servicio separado con endpoints `GET`, `POST`, `PATCH`, `DELETE` estándar.

---

### Files (`src/files/`) — Gestión de Archivos

**No usa S3** — almacenamiento **local en disco** bajo `UPLOADS_PATH` (por defecto `uploads`). Los archivos se suben por **multipart**; el límite de body JSON (30 MB) solo cubre las rutas base64.

**Controlador**: `FilesController` — 20+ endpoints. Todos exigen JWT + sesión + permiso `file.crear` (subidas), `file.consultar` (lecturas) o `file.eliminar`.

| Método HTTP | Ruta | Descripción | Max Size |
|-------------|------|-------------|----------|
| POST | `/files/upload-base64` | Upload genérico base64 (no devuelve URL) | límite de body (30 MB) |
| POST | `/files/video-base64` | Video en base64 | límite de body (30 MB) |
| POST | `/files/video` | Video multipart (MP4) | 20 MB (`MAX_VIDEO_MB`), máx. 15 s |
| GET | `/files/video/:id` | Stream del video | — |
| POST | `/files/appointment-upload` | Archivo de cita (DICOM/PNG/JPEG/WebP), a `uploads/.tmp` y luego a su carpeta | 100 MB (`DICOM_MAX_BYTES`) |
| GET | `/files/appointment-files/:fileId` | Descargar archivo de cita | — |
| GET | `/files/appointment-files?appointmentId=xxx` | Listar archivos de cita | — |
| POST | `/files/dicom-convert` | Convierte un DICOM a frames JPEG | 100 MB (`DICOM_MAX_BYTES`) |
| GET | `/files/dicom-conversions/:sessionId/:filename` | Servir un frame convertido | — |
| POST | `/files/profile-photo` | Foto perfil | 5 MB |
| POST | `/files/medical-center-photo` | Foto centro (WebP) | 5 MB |
| POST | `/files/doctor-photo` | Foto doctor | 5 MB |
| POST | `/files/common-person-photo` / `common-person-image` | Foto persona | 5 MB |
| GET | `/files/doctor-images/:imageId`, `/files/medical-center-images/:imageId`, `/files/common-person-images/:imageId`, `/files/*-photos/...` | Servir imágenes | — |
| DELETE | `/files/medical-center-images/:imageId` | Soft delete + físico | — |

Los topes de `appointment-upload`, `dicom-convert` y `/mammography-analyses/preview` se declaran con el decorador `@FileUpload(field, maxBytes)` de `src/files/upload-limits.ts`, que fija `limits.fileSize` de multer y traduce el 413 a un mensaje en español con el límite. Constantes: `ANALYSIS_IMAGE_MAX_BYTES = 20 MB` (imagen raster para el detector) y `DICOM_MAX_BYTES = 100 MB`.

**Procesos:**
- Imágenes de centro y perfil → conversión a **WebP calidad 85** con `sharp`
- Videos → validación formato MP4, tamaño y duración (≤ 15 s) con `ffmpeg.ffprobe`
- Las URLs que devuelve el servicio apuntan a endpoints protegidos `/files/...` (`buildFilesEndpointUrl`); **no existe una ruta pública `/uploads`**

---

### MammographyAnalysis (`src/mammography-analysis/`)

**Controlador**: `MammographyAnalysisController` — `/mammography-analyses/*` (throttle `short`)

| Método HTTP | Ruta | Permiso | Descripción |
|-------------|------|---------|-------------|
| POST | `/mammography-analyses` | `mammography-analysis.crear` | Analiza un archivo de cita ya subido y guarda el resultado |
| POST | `/mammography-analyses/preview` | `mammography-analysis.crear` | Multipart `file` (PNG/JPEG o DICOM): devuelve la predicción sin guardar |
| GET | `/mammography-analyses/inbox` | `mammography-analysis.consultar` | Bandeja del día agrupada por cita, ordenada por gravedad |
| GET | `/mammography-analyses/recent` | `mammography-analysis.consultar` | Ranking paginado del día por probabilidad |
| GET | `/mammography-analyses/stats/daily` | `mammography-analysis.consultar` | Totales, alertas, pendientes y alto riesgo (malignidad ≥ 80 %) |
| GET | `/mammography-analyses/appointment/:appointmentId` | `mammography-analysis.consultar` | Análisis de una cita |
| PATCH | `/mammography-analyses/:id/review` | `mammography-analysis.actualizar` | Marca como revisado (+ notas) |
| GET | `/mammography-analyses/:id/image` | `mammography-analysis.consultar` | Stream de la imagen analizada |
| GET | `/mammography-analyses/:id` | `mammography-analysis.consultar` | Detalle |

**Predicción en el servidor.** `POST /mammography-analyses` recibe `{ appointmentFileId, notes?, appointmentId?, patientId?, sourceFileName? }`. Si el cuerpo trae algún resultado del modelo (`prediction`, `probability`, `status`, `label`, `rawResponse(Json)`, `rawScore`, `malignancyProbability`, `threshold`, `modelVersion`), responde 400. El servicio:

1. Carga el `AppointmentFile`, comprueba que `appointmentId`/`patientId` coincidan y que el médico tenga acceso a la cita.
2. Lee el archivo del disco; un DICOM se convierte a JPEG del primer frame; una imagen raster mayor de 20 MB se rechaza (413).
3. Envía la imagen al detector con `DetectorClient.predict()`.
4. Guarda una fila en `mammography_analyses` con `prediction`, `probability`, `malignancy_probability`, `raw_score`, `threshold`, `model_version`, `status`, `label` y la respuesta cruda en `raw_response`. Si la fuente era DICOM, guarda también el JPEG analizado en `uploads/mammography-analyses/<appointmentId>/`.

**Cliente del detector** (`src/mammography-analysis/detector/detector.client.ts`):
- `POST ${DETECTOR_URL}/predict`, multipart con el campo `file`, cabecera `X-Detector-Secret: <DETECTOR_SECRET>` (secreto compartido con el servicio ML) y timeout `DETECTOR_TIMEOUT_MS` (por defecto 30000 ms).
- Valida la respuesta (rangos de `probability`, `rawScore`, `malignancyProbability`, `threshold`; coherencia `prediction`/`status`) y la normaliza a los enums del backend.
- Errores del detector → errores de dominio en español: 400 imagen dañada, 413 demasiado grande, 415 formato no soportado, 422 imagen fuera de dominio. Timeout, 401/403 (secreto incorrecto), 5xx o cuerpo inválido → 503 "El servicio de análisis no está disponible."

**Alcance por médico:** un médico sin `security.consultar` solo ve análisis de sus citas y los sin cita que él registró.

---

### Dashboard (`src/dashboard/`)

**Controlador**: `DashboardController` — 4 endpoints

| Método HTTP | Ruta | Descripción |
|-------------|------|-------------|
| GET | `/dashboard/stats` | Totales sistema |
| GET | `/dashboard/recent-appointments` | Citas recientes |
| GET | `/dashboard/appointments-by-status` | Distribución estado (gráfico pie) |
| GET | `/dashboard/appointments-by-month` | Citas por mes (gráfico barras) |

**Filtrado por rol:**
- Admin: ve todos los datos
- Doctor: ve solo sus propios datos
- Otro: ve datos de su centro médico

---

### Otros Módulos

| Módulo | Propósito |
|--------|-----------|
| `Health` | GET `/health` (Terminus: ping a la BD + heap). Es `@Public()`: responde 200 sin token |
| `Menu` | Menús dinámicos del sistema |
| `Logs` | ERROR logging en `auditoria.error_log`; vista HTML en `/logs/ui/view` (permiso `logs.consultar`) |
| `Queues` | BullMQ + Bull Board (solo `emailQueue`, sin jobs) |
| `RedisSession` | Sesiones persistidas en Redis |
| `Crypto` | Servicios de encriptación/hash |
| `Common` | Filtros, interceptores, adapters, caché, secuencias, `AuthContextService`, `UserAccessService` |
| `Configuration` | Config global + validación Joi |
| `Database` | Conexión TypeORM, DataSource del CLI, migraciones, `SchemaInitService` |

---

## Gestión de Archivos

### Estructura de Directorios en Disco

```
${UPLOADS_PATH:-uploads}/
├── .tmp/                           # Subidas multipart en curso (appointment-upload)
├── users/{ownerId}/profile/        # Fotos de perfil
├── doctors/{doctorId}/             # Fotos de doctores
├── medical-centers/{centerId}/     # Fotos de centros
├── common-persons/{personId}/      # Fotos de personas
├── {userId}/{medicalCenterId}/{appointmentId}/  # Archivos de cita
├── mammography-analyses/{appointmentId}/        # JPEG analizado cuando la fuente era DICOM
└── client-{id}/                    # Videos publicitarios
```

No hay `ServeStaticModule` ni `express.static` sobre esta carpeta: cada archivo se sirve por un endpoint de `files` (o `mammography-analyses/:id/image`) que pasa por los guards. Los únicos estáticos públicos son los assets de las vistas (`/logs/views`, `/admin/views`). En Docker, la carpeta se persiste en el volumen `uploads-data`.

> `video_publicidad.archivo_ruta` guarda la ruta dentro de uploads (`client-{id}/archivo.mp4`, migración `1790500100000-VideoRelativePath`). Las rutas de creación (`video-base64`, `video`) devuelven además `url` = `<host>/files/video/:id`, el endpoint que sirve el archivo.

### Procesamiento de Imágenes

Todas las imágenes se convierten a **WebP calidad 85** con `sharp`:

```typescript
// En files.service.ts
const convertedBuffer = await sharp(buffer)
  .webp({ quality: 85 })
  .toBuffer();
```

**Excepto:**
- Fotos de perfil de personas comunes (sin conversión)
- Archivos de cita (soportan DICOM original)

### Validación de Videos

Con `ffmpeg.ffprobe`:
- **Formato:** Solo MP4
- **Tamaño máx:** 20 MB (`VideoValidationInterceptor` y `MAX_VIDEO_MB`, por defecto 20; multer corta a 25 MB)
- **Duración máx:** 15 segundos

---

## Colas de Tareas (BullMQ)

### Setup

```typescript
// src/queues/queues.module.ts
BullModule.forRootAsync({
  useFactory: (config) => ({
    connection: {
      host: config.get('REDIS_HOST'),
      port: config.get('REDIS_PORT'),
      password: config.get('REDIS_PASSWORD') || undefined,
    },
  }),
}),
BullModule.registerQueue({ name: 'emailQueue' }),
```

### Estado actual

- El módulo de email (`EmailModule`, productor y worker con nodemailer) **se retiró**: no hay código que encole ni procese jobs.
- `emailQueue` se sigue registrando solo para que Bull Board tenga una cola que mostrar (`QueuesService.getBullAdapters()`). Permanece vacía.

### Administración

Panel en `/admin/queues` (Bull Board), montado en el mismo puerto de la API (`main.ts`):
- El router de Bull Board es Express y no pasa por los guards de Nest; lo protege el middleware `PanelAccessService.middleware('bullboard.consultar', '/admin/login')`: JWT válido (header `Authorization` o cookie `access_token`) + sesión Redis vigente + usuario activo + permiso `bullboard.consultar`.
- Navegación HTML sin acceso → redirección a `/admin/login`; peticiones de API → JSON 401/403.
- `GET /admin/login` (vista) y `POST /admin/login` (@Public) autentican como **usuario de sistema** (`isSystemUser: true`) y dejan el `access_token` en una cookie `httpOnly` de 1 h.

---

## Patrones de Arquitectura

### Repository Pattern

Cada módulo inyecta repositorios de TypeORM directamente:

```typescript
@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient, DatabaseConnectionName.DB_MAIN)
    private patientRepository: Repository<Patient>,
    
    @InjectDataSource(DatabaseConnectionName.DB_MAIN)
    private dataSource: DataSource
  ) {}
}
```

**QueryBuilder para consultas complejas:**

```typescript
const patients = await this.patientRepository
  .createQueryBuilder('p')
  .leftJoinAndSelect('p.commonPerson', 'cp')
  .leftJoinAndSelect('p.allergies', 'a')
  .where('p.deletedAt IS NULL')
  .andWhere('p.isActive = :isActive', { isActive: true })
  .orderBy('cp.firstName', 'ASC')
  .paginate(page, pageSize)
  .getMany();
```

### Cache Pattern

**Configuración** (`src/common/cache/cache.config.ts`, registrada en `app.module.ts` con `CacheModule.registerAsync({ isGlobal: true })`):

- `@nestjs/cache-manager` 3 + `cache-manager` 7. La v7 solo lee `stores`: se le pasa un `Keyv` con store `@keyv/redis` conectado a `REDIS_HOST`/`REDIS_PORT` con `REDIS_PASSWORD`.
- **Sin prefijo de clave** (`useKeyPrefix: false`): las claves quedan en Redis tal como las escriben los servicios (`appointment:detail:<id>`).
- **Todos los TTL están en milisegundos.** TTL por defecto: `CACHE_TTL_MS` (300000 = 5 min).
- Un listener de `error` registra las caídas de Redis en el log en vez de dejarlas como evento no manejado.

**Constantes** (`src/common/cache/cache-registry.ts`):

```typescript
export const CACHE_TTL = {
  LIST: 5 * 60_000,       // 5 min
  DETAIL: 10 * 60_000,    // 10 min
} as const;
```

**Patrón de alcances por generación.** Los listados (y los detalles que dependen de otras entidades) se guardan dentro de un *alcance* (`patient`, `doctor`, `recipe`, `medical-history`, `medicalCenter`, `department`, `user`, `users-security`, `roles`, `menus`, `allergy`, `medication`, ...). La clave real en Redis es `<clave>#<generación>`, donde la generación vive en `<alcance>:generation`. Invalidar un alcance es **una sola escritura** (un UUID nuevo): todas las entradas anteriores quedan huérfanas y vencen por TTL. No hay registro de claves que leer y reescribir, así que escrituras concurrentes no pueden perder una invalidación.

```typescript
// Lectura
const cacheKey = `patient:query:${JSON.stringify({ ...query, doctorId })}`;
const cached = await getScoped(this.cacheManager, 'patient', cacheKey);
if (cached) return cached;
// ... consulta a la BD ...
await setScoped(this.cacheManager, 'patient', cacheKey, result, CACHE_TTL.LIST);

// Escritura (create/update/remove)
await invalidateScope(this.cacheManager, 'patient');
```

**Vistas de citas.** Los listados de citas y los detalles `appointment:detail:<id>` viven en el alcance `APPOINTMENT_CACHE_SCOPE = 'appointment'`. Como embeben datos de paciente, médico, historial, receta y catálogos, también lo invalidan las escrituras de `PatientService`, `DoctorsService`, `MedicalHistoryService`, `RecipeService`, `AllergyService`, `ChronicDiseaseService`, `MedicationService`, `SpecialtyService`, `MedicalCenterService` y `DepartmentsService`. Los catálogos de alergias, enfermedades crónicas y medicamentos invalidan además el alcance `patient` (el detalle del paciente los embebe). Con el mismo criterio, los detalles `doctor:<id>` (embebe especialidades y centros), `recipe:<id>` y `recipe:medical-history:<id>` (embeben medicamentos, paciente y médico) y `medical-history:<id>` / `medical-history:patient:<id>` (embeben centro, especialidad, paciente y médico) viven en los alcances `doctor`, `recipe` y `medical-history`: especialidades y centros invalidan `doctor` y `medical-history`; medicamentos invalidan `recipe`; pacientes y médicos invalidan `recipe` y `medical-history`. Para inspeccionar: `redis-cli --scan --pattern 'appointment*'`.

La caché de permisos usa su propio esquema por generaciones (ver [Caché de permisos](#caché-de-permisos)).

### Soft Delete Pattern

Uniforme en todo el sistema:

```typescript
// Borrar lógico
async remove(id: string) {
  await this.patientRepository.update(id, {
    deletedAt: new Date(),
    isActive: false
  });
}

// Querys excluyen borrados
async findAll(filters) {
  return this.patientRepository
    .createQueryBuilder('p')
    .where('p.deletedAt IS NULL')  // ← Sempre
    .andWhere(...)
    .getMany();
}
```

### Códigos legibles APT CONS REC PAC

Los números de cita, consulta, receta y paciente salen de secuencias PostgreSQL mediante `nextCode()` (`src/common/sequence/next-code.ts`), que ejecuta `SELECT nextval(...)`, atómico frente a concurrencia:

| Prefijo | Secuencia | Columna |
|---------|-----------|---------|
| `APT` | `public.seq_appointment_number` | `medical_appointments.appointment_number` |
| `CONS` | `public.seq_consultation_number` | `medical_histories.consultation_number` |
| `REC` | `public.seq_recipe_number` | `recipes.recipe_number` |
| `PAC` | `public.seq_patient_code` | `patients.patient_code` |

Formato: `<PREFIJO>-<YYYY>-<NNNNN>` (año actual + valor de la secuencia con 5 dígitos mínimo). **El contador no se reinicia cada año**: el año es solo parte del texto. La migración `1790500000000-CodeSequences` crea las secuencias y las posiciona después del mayor sufijo numérico existente. Las columnas mantienen su índice único.

### Transacciones

Las escrituras multi-tabla son atómicas. Usos actuales:

| Servicio | Operación | Mecanismo |
|----------|-----------|-----------|
| `UserService` | `create()` (persona + usuario + centros + médico) y `remove()` | `QueryRunner` |
| `UserService` | `update()` (`users` + `persona_comun`) | `dataSource.transaction` |
| `PatientService` | `create()` (persona + paciente) | `dataSource.transaction` |
| `DoctorsService` | `create()` (persona + médico) | `dataSource.transaction` |
| `RecipeService` | `create()` (cabecera + ítems) y `update()` (reemplazo de ítems) | `dataSource.transaction` |
| `MedicalAppointmentsService` | `finishConsultation()` (historial + receta + estado de la cita) | `dataSource.transaction`, pasando el `EntityManager` a `MedicalHistoryService.create()` y `RecipeService.create()` |

Patrón para que un servicio participe en la transacción de otro: aceptar un `EntityManager` opcional y, si llega, escribir con él y no limpiar caché (lo hace el dueño de la transacción tras el commit).

Ejemplo con `QueryRunner`:

```typescript
async createUserWithCommonPerson(dto: CreateUserDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  
  await queryRunner.connect();
  await queryRunner.startTransaction();
  
  try {
    // 1. Crea CommonPerson
    const commonPerson = await queryRunner.manager.save(CommonPerson, {
      firstName: dto.firstName,
      ...
    });
    
    // 2. Crea User
    const user = await queryRunner.manager.save(User, {
      name: dto.username,
      email: dto.email,
      commonPersonId: commonPerson.id
    });
    
    await queryRunner.commitTransaction();
    return user;
    
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}
```

### IDOR (Insecure Direct Object Reference) Protection

El alcance se resuelve con `AuthContextService` (`src/common/services/auth-context.service.ts`):

- `getDoctorIdForUser(userId)`: `User → CommonPerson → Doctor` (busca el médico cuyo `commonPersonId` es la persona del usuario).
- `getScopedDoctorId(userId)`: devuelve `null` si el usuario tiene el permiso `security.consultar` (`ADMIN_SCOPE_PERMISSION`, alcance global) o si no es médico; si no, el `doctorId` que debe filtrar la consulta.

Lo usan pacientes, médicos, centros, citas, historiales, recetas y análisis de mamografía. En `PatientService.findAll()`:

```typescript
const doctorId = await this.authContextService.getScopedDoctorId(user?.id);
// ...
if (doctorId) {
  qb.andWhere(
    `patient.id IN (SELECT ma."patient_id" FROM medical_appointments ma WHERE ma."doctor_id" = :doctorId)`,
    { doctorId },
  );
}
```

El `doctorId` forma parte de la clave de caché, así que un médico nunca recibe el listado cacheado de otro.

### Validación Global

Un solo registro, como `APP_PIPE` en `app.module.ts` (no hay `useGlobalPipes` en `main.ts`):

```typescript
{
  provide: APP_PIPE,
  useFactory: () =>
    new ValidationPipe({
      transform: true,  // Convierte tipos automáticamente
      whitelist: true,  // Elimina en silencio las propiedades no decoradas
    }),
}
```

No se usa `forbidNonWhitelisted`: una propiedad desconocida se descarta, no provoca 400. Para rechazar explícitamente un campo, el DTO lo declara con un validador (por ejemplo `@IsEmpty()` en los resultados del modelo de `CreateMammographyAnalysisDto`).

Con class-validator en DTOs:

```typescript
export class CreatePatientDto {
  @IsString()
  @MinLength(3)
  firstName: string;
  
  @IsEmail()
  email: string;
  
  @IsOptional()
  @IsUUID()
  medicalCenterId?: string;
}
```

---

## Configuración y Entorno

### Variables de Entorno

La lista autoritativa es el esquema Joi de `src/configuration/validation.ts`; `ConfigModule` lo aplica al arrancar y, si falta una variable obligatoria o tiene un tipo incorrecto, la app no arranca. Los valores de ejemplo son marcadores: no hay secretos en este documento.

**Validadas por Joi:**

| Variable | Obligatoria | Por defecto | Uso |
|----------|-------------|-------------|-----|
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test`. Swagger solo existe en `development` |
| `PORT` | No | `7008` | Puerto HTTP (en Docker, `8008`; ver [Puerto](#puerto-y-log-de-arranque)) |
| `URL_HOST` | No | `localhost` | Host para el log de arranque y las URLs de archivos |
| `TZ` | No | `America/Caracas` | Zona horaria |
| `DB_HOST` | **Sí** | — | Host PostgreSQL |
| `DB_PORT` | No | `5432` | |
| `DB_USER` | No | `postgres` | |
| `DB_PASS` | **Sí** (puede ser vacía) | — | |
| `DB_NAME` | No | `bd_gestion_medica` | |
| `REDIS_HOST` | **Sí** | — | Redis de caché y BullMQ |
| `REDIS_PORT` | No | `6379` | |
| `REDIS_PASSWORD` | No | `''` | Contraseña de Redis: la usan caché, BullMQ y, si `REDIS_SESSION_PASS` está vacía, las sesiones |
| `REDIS_SESSION_HOST` | **Sí** | — | Redis de sesiones |
| `REDIS_SESSION_PORT` | No | `6379` | |
| `REDIS_SESSION_PASS` | No | `''` | Contraseña específica del Redis de sesiones |
| `JWT_SECRET` | **Sí** | — | Firma del access token |
| `JWT_EXPIRES_IN` | No | `1h` | Vida del access token |
| `JWT_REFRESH_SECRET` | **Sí** | — | Firma del refresh token |
| `ENCRYPT_KEY` | **Sí** (mín. 16 caracteres) | — | Clave del adaptador de cifrado (`src/common/crypto-adapter`) |
| `CACHE_TTL_MS` | No | `300000` | TTL por defecto de la caché, en **milisegundos** (mín. 1000) |
| `DETECTOR_URL` | **Sí** (http/https) | — | URL base del servicio detector; el cliente llama `${DETECTOR_URL}/predict` |
| `DETECTOR_SECRET` | **Sí** | — | Secreto compartido, enviado en `X-Detector-Secret` |
| `DETECTOR_TIMEOUT_MS` | No | `30000` | Timeout de la llamada al detector (mín. 1000) |

**Leídas por el código sin validación Joi** (opcionales, con valor por defecto en el código):

| Variable | Por defecto | Uso |
|----------|-------------|-----|
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Vida del refresh token y, por tanto, de la sesión Redis |
| `CORS_ORIGIN` | cualquier origen (`true`) | Origen permitido por CORS |
| `UPLOADS_PATH` | `uploads` | Carpeta de archivos |
| `MAX_VIDEO_MB` | `20` | Tamaño máximo de video multipart |
| `PERMISSIONS_SECRET` | clave fija interna | Clave de la ofuscación de `/auth/me` (ver [Ofuscación de Permisos](#ofuscación-de-permisos)) |
| `APP_NAME` | `API BASE` | Título de Swagger |
| `APP_VERSION` | `npm_package_version` | Versión registrada en los logs de error (la cabecera `x-app-version` tiene prioridad) |

Ejemplo de `.env` para desarrollo local (solo marcadores):

```ini
NODE_ENV=development
PORT=7008
URL_HOST=localhost
TZ=America/Caracas

DB_HOST=localhost
DB_PORT=5432
DB_USER=<usuario>
DB_PASS=<clave>
DB_NAME=bd_gestion_medica

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<clave-redis>
REDIS_SESSION_HOST=localhost
REDIS_SESSION_PORT=6379
REDIS_SESSION_PASS=

JWT_SECRET=<secreto-access>
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=<secreto-refresh>
JWT_REFRESH_EXPIRES_IN=7d

ENCRYPT_KEY=<minimo-16-caracteres>
PERMISSIONS_SECRET=<clave-compartida-con-el-frontend>

CACHE_TTL_MS=300000

DETECTOR_URL=http://localhost:8501
DETECTOR_SECRET=<secreto-compartido-con-el-detector>
DETECTOR_TIMEOUT_MS=30000

CORS_ORIGIN=http://localhost:4200
UPLOADS_PATH=uploads
```

Ya no existen como variables de entorno `TOKEN_VALIDATOR`, `EMAIL_*`, `CACHE_TTL`, `CACHE_MAX`, `BULL_BOARD_PORT` ni `REDIS_SESSION_TTL`.

**Docker:** el compose real es `tesis/docker-compose.yml` (fuera de este repositorio). El servicio `backend` carga `api-gestion-medica/.env` y sobrescribe `NODE_ENV=production`, `PORT=8008`, los hosts de Redis (`redis-shared`), `DB_HOST=host.docker.internal` y `DETECTOR_URL=http://machine-learning:8501`. `REDIS_PASSWORD`, `REDIS_SESSION_PASS` y `DETECTOR_SECRET` se toman de `tesis/.env` (no versionado); el compose no arranca si faltan.

### Bootstrap (`main.ts`)

No existe un `app.config.ts`: toda la configuración global está en `src/main.ts` y `src/app.module.ts`.

```typescript
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // Vistas Handlebars (logs y Bull Board)
  app.setBaseViewsDir(join(__dirname, '..', 'src'));
  app.setViewEngine('hbs');
  app.use(cookieParser());

  // 30 MB: cubre el video base64; los archivos van por multipart
  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ limit: '30mb', extended: true }));

  // Assets públicos de las vistas
  app.useStaticAssets(join(__dirname, '..', 'src', 'logs', 'views'), { prefix: '/logs/views' });
  app.useStaticAssets(join(__dirname, '..', 'src', 'queues', 'bull-board', 'views'), { prefix: '/admin/views' });

  // CORS: sin CORS_ORIGIN se acepta cualquier origen
  app.enableCors({
    origin: configService.get('CORS_ORIGIN') || true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'token', 'Token', 'TOKEN'],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  // Swagger en /api, solo con NODE_ENV=development
  if (NODE_ENV === 'development') SwaggerModule.setup('api', app, document);

  // ValidationPipe NO se registra aquí: es APP_PIPE en app.module.ts
  app.useGlobalInterceptors(new HttpResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter(logsService));
  app.useGlobalGuards(jwtAuthGuard, sessionGuard, permissionsGuard);

  // Bull Board detrás de JWT + sesión + permiso bullboard.consultar
  app.use('/admin/queues', panelAccess.middleware('bullboard.consultar', '/admin/login'), bullBoardRouter);

  const PORT = configService.get<number>('PORT') ?? 3000;
  await app.listen(PORT);
}
```

- **Sin prefijo global:** las rutas cuelgan de la raíz (`/auth/login`, `/patient`, ...). `/api` es solo Swagger.
- **Sin `/uploads` público:** no se registra `ServeStaticModule` ni `express.static` para los archivos subidos.

### Puerto y log de arranque

- Joi fija `PORT=7008` si la variable no está; el `?? 3000` de `main.ts` solo aplicaría si `ConfigService` no devolviera valor. El `Dockerfile` y `tesis/docker-compose.yml` fijan **`PORT=8008`**: el valor desplegado es 8008 (`http://localhost:8008`).
- El log de arranque imprime la URL base sin `/api` (`🚀 App corriendo en: http://<URL_HOST>:<PORT>`), la URL de Swagger solo en `development`, la de la vista de logs (`/logs/ui/view`) y la del login de Bull Board (`/admin/login`).
- En el contenedor `NODE_ENV=production`, así que `/api` responde 404.

---

## Flujos Clave

### Flujo: Crear Cita Médica

```
POST /medical-appointments
├─ Valida DTO (CreateMedicalAppointmentDto)
├─ Verifica permisos: @Permission('appointments.crear')
├─ MedicalAppointmentsService.create()
│  ├─ Valida que el paciente exista (o crea uno nuevo)
│  ├─ Valida que el doctor exista
│  ├─ Verifica disponibilidad horaria del doctor
│  ├─ Genera appointmentNumber desde seq_appointment_number (APT-<YYYY>-<NNNNN>)
│  ├─ Guarda en BD
│  └─ Invalida cache
├─ HttpResponseInterceptor estandariza respuesta
└─ RESPONSE { code: 201, data: { id, appointmentNumber, ... } }
```

### Flujo: Finalizar Consulta (Crear Historial + Receta)

```
PATCH /medical-appointments/:id/finish-consultation
├─ Valida DTO (CompleteConsultationDto)
├─ Verifica permisos: @Permission('appointments.crear') [DIAGNOSTICAR = 'crear']
├─ Valida los medicationId de la receta (antes de abrir la transacción)
├─ dataSource.transaction(manager => ...)
│  ├─ Bloquea la cita (pessimistic_write); si ya está COMPLETED → 400
│  ├─ MedicalHistoryService.create(dto, userId, manager)
│  │  ├─ Signos vitales, diagnóstico + código CIE-10, plan de tratamiento
│  │  └─ consultationNumber desde seq_consultation_number
│  ├─ [Si viene receta] RecipeService.create(dto, userId, manager)
│  │  ├─ Cabecera + ítems (medicamento + dosis)
│  │  └─ recipeNumber desde seq_recipe_number
│  └─ MedicalAppointment.status = COMPLETED
├─ Commit; si algo falla, rollback completo
├─ Tras el commit: limpia cachés de historial, receta y cita
├─ Respuesta: la cita completa (loadFullAppointment)
└─ El frontend sube archivos (mamografías) vía POST /files/appointment-upload
   y pide el análisis con POST /mammography-analyses { appointmentFileId }
```

### Flujo: Análisis de Mamografía

```
POST /mammography-analyses { appointmentFileId, notes? }
├─ Verifica permisos: @Permission('mammography-analysis.crear')
├─ DTO rechaza (400) cualquier resultado del modelo enviado por el cliente
├─ MammographyAnalysisService.create()
│  ├─ Carga el AppointmentFile y comprueba acceso del médico a la cita
│  ├─ Lee la imagen del disco (DICOM → JPEG del primer frame)
│  ├─ DetectorClient.predict(): POST ${DETECTOR_URL}/predict
│  │  └─ cabecera X-Detector-Secret, timeout DETECTOR_TIMEOUT_MS
│  └─ Guarda mammography_analyses (prediction, probability, malignancy_probability,
│     raw_score, threshold, model_version, status, label, raw_response)
└─ RESPONSE: el análisis guardado
```

### Flujo: Login

```
POST /auth/login { credential, password, isSystemUser }
├─ @Public() → bypass de los tres guards
├─ AuthService.login()
│  ├─ isSystemUser=true → validateSystemUser() (seguridad.users)
│  ├─ isSystemUser=false → validateUser() (public.users)
│  ├─ Busca por email o name entre usuarios activos y no borrados
│  ├─ bcrypt.compare() (contra hash ficticio si no existe el usuario)
│  ├─ Usuario inexistente / inactivo / rol inactivo / clave errónea → 401 "Credenciales inválidas"
│  ├─ signTokens({ id, roleId, name })
│  │  └─ access_token (JWT_SECRET) + refresh_token (JWT_REFRESH_SECRET)
│  └─ RedisSessionService.setSession('session:<id>', { access_token, refresh_token, userId, roleId, loginAt })
│     └─ TTL = segundos hasta el exp del refresh_token
└─ RESPONSE (res.json directo): { access_token, refresh_token }
```

### Flujo: Refresh Token

```
POST /auth/refresh { refreshToken }
├─ @Public() → bypass de los tres guards
├─ AuthService.refreshTokens()
│  ├─ JwtService.verify(refreshToken, JWT_REFRESH_SECRET) → si falla, 401
│  ├─ Lee session:<id>; sin sesión → 401
│  ├─ refresh_token de la sesión ≠ enviado → 401
│  ├─ Relee usuario + rol; inactivo o borrado → borra la sesión y 401
│  ├─ signTokens({ id, roleId, name }) → par nuevo
│  └─ setSession(..., { ..., refreshedAt }) con TTL = vida del nuevo refresh
└─ RESPONSE (res.json directo): { access_token, refresh_token }
```

### Flujo: Get Permisos de Usuario

```
GET /auth/me
├─ JwtAuthGuard: verifica token
├─ SessionGuard: verifica Redis + usuario activo
├─ PermissionsGuard: permite (sin @Permission requerido)
├─ AuthService.getUserWithPermissions(userId)
│  ├─ PermissionService.getUserPermissions(userId) → permisos y menús
│  ├─ Busca el usuario en seguridad.users y luego en public.users
│  ├─ Usuario regular: doctorId vía User → CommonPerson → Doctor
│  ├─ medicalCenters = centros del médico ∪ users_medical_centers (sin duplicados)
│  └─ modules = encryptModules({ ...permisos/menús, medicalCenters })
├─ RESPONSE: { id, name, email, doctorId, modules: "<iv>:<datos>" }
└─ El frontend descifra modules con crypto.subtle (ofuscación, no seguridad)
```

---

## Dependencias Externas

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `@nestjs/common` | ^11.0.1 | Framework core |
| `@nestjs/core` | ^11.0.1 | DI + Module system |
| `@nestjs/typeorm` | ^11.0.0 | Integración ORM |
| `typeorm` | ^0.3.20 | ORM + CLI de migraciones |
| `pg` | ^8.13.3 | Driver PostgreSQL |
| `@nestjs/jwt` | ^11.0.0 | JWT (sin Passport) |
| `bcrypt` | ^6.0.0 | Hash de contraseñas |
| `@nestjs/bullmq` | ^11.0.4 | Integración BullMQ |
| `bullmq` | ^5.63.0 | Colas Redis |
| `@bull-board/*` | ^6.14.1 | Panel de colas |
| `@nestjs/cache-manager` | ^3.0.1 | Cache |
| `cache-manager` | ^7.2.4 | Cache (TTL en ms, `stores` Keyv) |
| `@keyv/redis` | ^5.1.6 | Store Redis de la caché |
| `redis` | ^4.7.1 | Cliente Redis de sesiones |
| `ioredis` | ^5.8.2 | Declarada; `src/` no la importa directamente |
| `@nestjs/throttler` | ^6.4.0 | Rate limiting |
| `@nestjs/swagger` | ^11.2.6 | Documentación API |
| `@nestjs/terminus` | ^11.0.0 | Health checks |
| `@nestjs/config` | ^4.0.2 | Config management |
| `@nestjs/serve-static` | ^5.0.4 | Declarada; `src/` no la usa (no hay `/uploads` público) |
| `class-validator` | ^0.14.1 | Validación DTOs |
| `class-transformer` | ^0.5.1 | Transformación DTOs |
| `joi` | ^18.0.1 | Validación env vars |
| `pdfkit` | ^0.17.2 | Generación PDFs |
| `exceljs` | ^4.4.0 | Generación Excel |
| `sharp` | ^0.34.5 | Procesamiento imágenes |
| `dicom-parser` | ^1.8.21 | Lectura de DICOM |
| `fluent-ffmpeg` | ^2.1.3 | Validación videos |
| `moment` | ^2.30.1 | Manejo fechas |
| `hbs` | ^4.2.0 | Templates Handlebars |
| `cookie-parser` | ^1.4.7 | Parseo de cookies |
| `axios` | ^1.13.2 | HTTP client (adapter); el detector usa `fetch` nativo |
| `xml2js` | ^0.6.2 | Parseo XML |

Ya no forman parte del proyecto: `@nestjs/passport`, `passport-jwt`, `nodemailer` y `cache-manager-redis-store`.

---

## Guía para Desarrolladores

### Crear un nuevo módulo

1. **Generar estructura**
   ```bash
   nest g module features/mi-modulo
   nest g controller features/mi-modulo
   nest g service features/mi-modulo
   ```

2. **Crear entidad TypeORM**
   ```typescript
   // src/features/mi-modulo/mi-modulo.entity.ts
   @Entity('mi_tabla')
   export class MiEntidad {
     @PrimaryGeneratedColumn('uuid')
     id: string;
   
     @Column()
     nombre: string;
   
     @CreateDateColumn()
     createdAt: Date;
   
     @Column({ nullable: true })
     deletedAt: Date;
   }
   ```

3. **Crear DTOs con validación**
   ```typescript
   export class CreateMiModuloDto {
     @IsString()
     @MinLength(3)
     nombre: string;
   }
   ```

4. **Inyectar repositorio en servicio**
   ```typescript
   @Injectable()
   export class MiModuloService {
     constructor(
       @InjectRepository(MiEntidad, DatabaseConnectionName.DB_MAIN)
       private repository: Repository<MiEntidad>
     ) {}
   }
   ```

5. **Definir rutas con permisos**
   ```typescript
   @Controller('mi-modulo')
   export class MiModuloController {
     @Post()
     @Permission('mi-modulo.crear')
     create(@Body() dto: CreateMiModuloDto) {
       return this.service.create(dto);
     }
   
     @Get()
     findAll() {
       return this.service.findAll();
     }
   }
   ```

6. **Registrar en módulo**
   ```typescript
   @Module({
     imports: [TypeOrmModule.forFeature([MiEntidad], DatabaseConnectionName.DB_MAIN)],
     controllers: [MiModuloController],
     providers: [MiModuloService],
     exports: [MiModuloService]
   })
   export class MiModuloModule {}
   ```

7. **Importar en app.module.ts**
   ```typescript
   @Module({
     imports: [..., MiModuloModule]
   })
   export class AppModule {}
   ```

8. **Crear la tabla con una migración** (no hay `synchronize`)
   ```bash
   npm run migration:generate -- src/database/migrations/CreateMiTabla
   npm run migration:run
   npm run typeorm -- migration:generate src/database/migrations/DriftCheck --dryrun --check
   ```

### Mejores prácticas

- **Soft delete siempre:** `deletedAt` + `isActive = false`
- **Cache para consultas frecuentes:** `CACHE_TTL.LIST` (5 min) para listas, `CACHE_TTL.DETAIL` (10 min) para un registro; TTL siempre en milisegundos; guardar con `setScoped()` y llamar a `invalidateScope()` en cada escritura
- **Transacciones para operaciones múltiples:** `dataSource.transaction()` (o `QueryRunner`); aceptar un `EntityManager` opcional para participar en la transacción de otro servicio
- **Cambios de esquema solo por migración:** generar, revisar, aplicar y comprobar que no hay deriva (ver [Flujo de Migraciones](#flujo-de-migraciones))
- **Validación en DTOs:** Usar class-validator, nunca en controlador
- **Permisos granulares:** `@Permission('modulo.accion')` en cada endpoint
- **Protección IDOR:** Filtrar resultados según usuario autenticado
- **Logging centralizado:** Excepciones guardadas en BD automáticamente
- **Documentación Swagger:** Decoradores `@ApiOperation`, `@ApiResponse`

---

**Versión del documento:** 1.1  
**Última actualización:** 2026-10-01  
**Mantenido por:** Equipo de Backend
