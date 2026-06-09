# Arquitectura Backend — Proyecto API Gestión Médica

**Última actualización:** Mayo 2026

## Índice

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura General](#arquitectura-general)
3. [Estructura de Carpetas](#estructura-de-carpetas)
4. [Base de Datos](#base-de-datos)
5. [Autenticación y Seguridad](#autenticación-y-seguridad)
6. [Sistema de Permisos (RBAC)](#sistema-de-permisos-rbac)
7. [Módulos/Features](#módulos-features)
8. [Gestión de Archivos](#gestión-de-archivos)
9. [Colas de Tareas (BullMQ)](#colas-de-tareas-bullmq)
10. [Patrones de Arquitectura](#patrones-de-arquitectura)
11. [Configuración y Entorno](#configuración-y-entorno)
12. [Flujos Clave](#flujos-clave)
13. [Dependencias Externas](#dependencias-externas)
14. [Guía para Desarrolladores](#guía-para-desarrolladores)

---

## Resumen Ejecutivo

**API Gestión Médica** es un backend REST construido con **NestJS 11** que gestiona:

- 🏥 Clínicas/centros médicos, departamentos, especialidades
- 👥 Pacientes, médicos, usuarios del sistema
- 📋 Citas médicas, consultas, historial clínico, recetas
- 🔐 Autenticación JWT con sesiones Redis + permisos cifrados
- 💾 PostgreSQL con 4 schemas (public, seguridad, parametro, auditoria)
- 📁 Almacenamiento local de archivos con procesamiento (WebP, DICOM)
- 📧 Colas BullMQ para envío de emails asíncrono
- 🎯 Rate limiting, validación global, logging centralizado

**Stack técnico:**
- NestJS 11 + Express adapter
- TypeORM 0.3.20 + PostgreSQL
- Redis (colas BullMQ + sesiones)
- Passport.js + JWT
- BullMQ + Bull Board
- Sharp (procesamiento de imágenes) + FFmpeg (validación de video)
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
│   └── ... (25+ módulos en total)
│
└── Global Guards (cadena):
    1️⃣ JwtAuthGuard     (verifica token)
    2️⃣ SessionGuard     (verifica Redis)
    3️⃣ PermissionsGuard (verifica permisos)
```

### Flujo de una Petición HTTP

```
REQUEST → NestJS Router
    ↓
Middleware (cors, cookie-parser, body-parser)
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
├── main.ts                  ← Bootstrap: CORS, Swagger, guards globales, pipes
├── app.module.ts            ← Root module con 25+ imports
│
├── auth/                    # Autenticación JWT
│   ├── auth.controller.ts
│   ├── auth.service.ts      # loginWithCredentials, refreshToken, etc.
│   ├── auth.const.ts
│   ├── decorators/          # @Public(), @Permission(), @GetUser()
│   ├── dto/
│   ├── guards/              # JwtAuthGuard, SessionGuard, PermissionsGuard
│   ├── interfaces/
│   ├── strategies/          # JwtStrategy (Passport)
│   └── utils/               # permissions-cipher.util.ts (AES-256-CBC)
│
├── common/                  # Transversal utilities
│   ├── common.module.ts
│   ├── exceptions/          # HttpExceptionFilter
│   ├── interceptors/        # HttpResponseInterceptor
│   ├── services/            # AuthContextService
│   └── adapters/            # crypto, date, excel, http, pdf, xml
│
├── configuration/           # Config global + validation
│   ├── configuration.ts     # configFactory()
│   └── validation.ts        # Joi validation
│
├── database/                # TypeORM + Schema init
│   ├── getMainConnection.ts # Conexión principal
│   └── schema-init.service.ts # Crea schemas al boot
│
├── user/                    # Usuarios del sistema
│   ├── user.controller.ts   # CRUD /users
│   ├── user.service.ts      # Con transacciones
│   ├── user.module.ts
│   └── entities/            # User (public.users)
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
│   ├── medical-appointments.controller.ts  # 13 endpoints
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
│   ├── files.controller.ts  # 17+ endpoints
│   ├── files.service.ts     # Sharp + FFmpeg
│   ├── entities/            # AppointmentFile, DoctorImage, ...
│   └── strategies/          # Multer local
│
├── queues/                  # BullMQ + Bull Board
│   ├── queues.module.ts
│   ├── queues.service.ts
│   ├── bull-board/
│   └── workers/             # email.processor.ts
│
├── email/                   # Envío de correos
│   ├── email.service.ts
│   └── templates/           # Plantillas Handlebars
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
│   └── health.controller.ts # GET /health (Terminus)
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
- **Sincronización:** Manual via `SchemaInitService.onApplicationBootstrap()`

### Schemas y sus Entidades

| Schema | Propósito | Entidades clave |
|--------|-----------|-----------------|
| `public` | Datos clínicos | users, patients, doctors, medical_appointments, medical_histories, recipes, medical_centers, departments, common-person, etc. |
| `seguridad` | Autenticación y RBAC | users (UserSecurity), roles, permissions, permission_menus, menus |
| `parametro` | Catálogos del sistema | specialties, allergies, chronic_diseases, medications, genders, civil_statuses, identity_documents, states, municipalities, parishes |
| `auditoria` | Logs de errores | error_logs (registro centralizado de excepciones) |

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
name (unique) — username
email (unique)
password (hashed with bcrypt)
roleId (FK → roles)
status (boolean)
firstLogin (boolean)
createdAt, updatedAt, deletedAt
Relaciones:
  — @OneToOne CommonPerson
  — @ManyToOne Role
  — @OneToMany UserSecurity (?)
```

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
patientCode (varchar 20, unique) — "PAC-2025-001"
maritalStatus, occupation
emergencyContactName, emergencyContactPhone, emergencyContactRelationship
bloodType, insuranceCompany, insurancePolicyNumber
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

---

## Autenticación y Seguridad

### Stack Criptográfico

- **Contraseñas:** Hashing con `bcrypt` v5.1.1 (bcryptjs alternativo)
- **JWT:** `@nestjs/jwt` v11 + `passport-jwt` v4
- **Permisos:** Cifrado AES-256-CBC en respuesta de `/auth/me`
- **Sesiones:** Almacenadas en Redis con TTL configurable (default 3600s)

### Flujo de Login

```
1. POST /auth/login { credential, password, isSystemUser }
   ↓
2. AuthService.loginWithCredentials()
   — Si isSystemUser=true → consulta UserSecurity (schema seguridad)
   — Si isSystemUser=false → consulta User (schema public)
   — Verifica password con bcrypt.compare()
   ↓
3. JwtService.sign() genera:
   — access_token (TTL: 1h)
   — refresh_token (TTL: 7d)
   ↓
4. RedisSessionService.createSession() — almacena sesión en Redis
   ↓
5. Respuesta: { access_token, refresh_token, user: {...} }
   ↓
6. Cliente guarda en localStorage/cookies
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

if (!token) throw new ForbiddenException('Missing token');

// Verifica con JwtService.verify(token, { secret: JWT_SECRET })
// Si es válido: inyecta req.user = payload decodificado
// Si es inválido: lanza UnauthorizedException (401)
```

**Guard 2 — SessionGuard** (`src/auth/guards/session.guard.ts`)

Se ejecuta **después** de JwtAuthGuard. Verifica que la sesión sea válida en Redis.

```typescript
// Llama RedisSessionService.isValidSessionToken(userId, accessToken)
// En Redis busca: `session:{userId}` con el accessToken actual

// Si sesión expiró o fue cerrada manualmente (logout):
// lanza UnauthorizedException (401)
```

**Guard 3 — PermissionsGuard** (`src/auth/guards/permission.guard.ts`)

Se ejecuta **tercero**. Valida permisos específicos via `@Permission()`.

```typescript
// Lee permisos requeridos del decorador:
// @Permission('patient.crear') o @Permission(['patient.ver', 'patient.editar'])

// Carga usuario completo con su rol y role.permissionMenus
// Construye lista de permisos: [{menu.slug}.{permission.name}, ...]

// Compara permiso requerido contra la lista
// Si no tiene permiso: lanza ForbiddenException (403)
```

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
@Permission(['patient.ver', 'patient.consultar'])  // al menos uno
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

La sesión se estructura como:

```json
{
  "session:{userId}": {
    "accessToken": "<token>",
    "refreshToken": "<token>",
    "userId": "<uuid>",
    "email": "user@example.com",
    "createdAt": 1234567890,
    "expiresAt": 1234571490,
    "device": "Chrome on Windows",
    "ip": "192.168.1.1"
  }
}
```

**TTL:** Configurable via `REDIS_SESSION_TTL` env (default 3600s = 1h)

### Refresh Token

```
POST /auth/refresh { refreshToken }
    ↓
AuthService.refreshTokens()
    — Verifica que el refreshToken coincida con el de Redis
    — Si coincide: genera nuevo access_token
    — Si no coincide: lanza UnauthorizedException (401)
    ↓
Respuesta: { access_token, refresh_token }
```

### Cifrado de Permisos

Al responder `GET /auth/me`, los módulos/permisos van **cifrados** con AES-256-CBC:

```typescript
// En auth.service.ts
const modules = {
  patient: ['crear', 'ver', 'actualizar'],
  appointments: ['crear', 'ver']
};

// Se cifra con crypto.subtle.encrypt() usando PERMISSIONS_SECRET
// El cliente lo desencripta en el frontend
```

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
  PermissionMenu { menuId: "patients", permissionId: "create" }
    → Permiso: "patient.crear"
  
  PermissionMenu { menuId: "appointments", permissionId: "view" }
    → Permiso: "appointments.ver"
  
  PermissionMenu { menuId: "medical-history", permissionId: "diagnose" }
    → Permiso: "medical-history.diagnosticar"
```

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

**Cache:** Invalidación selectiva por rol, por usuario, o global.

### Acciones Estándar

En `permission.const.ts`:

```typescript
enum PermissionActionsMenu {
  CREATE = 'crear',          // crear
  VIEW = 'consultar',         // ver/leer
  UPDATE = 'actualizar',      // editar
  DELETE = 'eliminar',        // borrar
  DIAGNOSE = 'diagnosticar'  // alias para crear diagnóstico
}
```

### Módulos del Sistema

En `menu.const.ts`:

```typescript
enum ModuleItemsMenu {
  PatientModule             = 'patient',
  DoctorsModule             = 'doctors',
  MedicalHistoryModule      = 'medical-history',
  RecipeModule              = 'recipe',
  AppointmentsModule        = 'appointments',
  MedicalCenterModule       = 'medical-center',
  DepartmentsModule         = 'departments',
  FileModule                = 'file',
  UserModule                = 'user',
  RoleModule                = 'role',
  PermissionModule          = 'permission',
  MenuModule                = 'menu',
  ParametersModule          = 'parameters',
  DashboardModule           = 'dashboard'
}
```

---

## Módulos/Features

### Auth (`src/auth/`)

**Controlador**: `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`, `POST /auth/refresh`, `GET /auth/me`

**Servicios:**
- `AuthService` — login, logout, refresh, verificación de sesión
- `UserPermissionsService` — carga permisos, menús, descifra módulos

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
- `create()` usa transacción: crea/reutiliza CommonPerson → crea User → opcionalmente crea Doctor
- `remove()` soft delete: `deletedAt = now`, `status = false`
- Cache Redis para queries

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
- **IDOR Protection**: Si el usuario es doctor, `findAll()` retorna solo pacientes con citas del doctor
- Genera código único: `PAC-2025-001`
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

**Acciones en una transacción:**
1. Crea `MedicalHistory` con signos vitales, diagnóstico
2. Crea `Recipe` con ítems (si se proporciona)
3. Actualiza `MedicalAppointment.status = COMPLETED`
4. Retorna IDs creados para que frontend suba archivos

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
- Datos de consulta: fecha, número, motivo, síntomas, examen físico
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

**No usa S3 ni Multer configurado globalmente** — almacenamiento **local en disco**.

**Controlador**: `FilesController` — 17+ endpoints

| Método HTTP | Ruta | Descripción | Max Size |
|-------------|------|-------------|----------|
| POST | `/files/upload-base64` | Upload genérico base64 | — |
| POST | `/files/video-base64` | Video en base64 | 25MB |
| POST | `/files/video` | Video multipart (MP4) | 25MB, max 15s |
| POST | `/files/appointment-upload` | Imágenes de cita | 50MB, DICOM/PNG/JPEG |
| GET | `/files/appointment-files/:fileId` | Descargar archivo cita | — |
| GET | `/files/appointment-files?appointmentId=xxx` | Listar archivos cita | — |
| POST | `/files/profile-photo` | Foto perfil | 5MB |
| POST | `/files/medical-center-photo` | Foto centro (WebP) | 5MB |
| POST | `/files/doctor-photo` | Foto doctor (WebP) | 5MB |
| POST | `/files/common-person-photo` | Foto persona | 5MB |
| GET | `/files/doctor-images/:imageId` | Servir foto doctor | — |
| DELETE | `/files/medical-center-images/:imageId` | Soft delete + físico | — |

**Procesos:**
- Imágenes → conversión a **WebP calidad 85** con `sharp`
- Videos → validación formato MP4, duración, tamaño con `ffmpeg.ffprobe`
- Estructura carpetas: `/uploads/{tipo}/{ownerId}/{...}`

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
| `Health` | GET `/health` (Terminus health checks) |
| `Menu` | Menús dinámicos del sistema |
| `Logs` | ERROR logging en auditoria.error_logs |
| `Queues` | BullMQ setup + Bull Board |
| `Email` | Envío de correos con nodemailer |
| `RedisSession` | Sesiones persistidas en Redis |
| `Crypto` | Servicios de encriptación/hash |
| `Common` | Filtros, interceptores, adapters globales |
| `Configuration` | Config global + validación Joi |
| `Database` | Conexión TypeORM + Schema init |

---

## Gestión de Archivos

### Estructura de Directorios en Disco

```
./uploads/
├── users/{userId}/profile/        # Fotos de perfil
├── doctors/{doctorId}/             # Fotos de doctores
├── medical-centers/{centerId}/     # Fotos de centros
├── common-persons/{personId}/      # Fotos de personas
├── {userId}/{medicalCenterId}/{appointmentId}/  # Archivos de cita
└── videos/                         # Videos publicitarios
```

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
- **Tamaño máx:** 25MB
- **Duración máx:** 15 segundos

---

## Colas de Tareas (BullMQ)

### Setup

```typescript
// src/queues/queues.module.ts
@Global()
export class QueuesModule {
  imports: [
    BullModule.forRoot({ connection: redisInstance }),
    BullModule.registerQueue({ name: 'emailQueue' })
  ]
}
```

### Flujo

```
1. Aplicación quiere enviar email
   ↓
2. Agrega job a cola: emailQueue.add({ to, subject, template, data })
   ↓
3. Redis almacena el job
   ↓
4. Processor (worker) procesa jobs en background
   ↓
5. EmailProcessor.process() → nodemailer.sendMail()
   ↓
6. Job completado o fallido
```

### Administración

Panel en `GET /admin/queues` (Bull Board):
- Ver estado de jobs (pending, active, completed, failed)
- Reintentar jobs fallidos
- Purgar colas

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

Con `@nestjs/cache-manager` (Redis):

```typescript
@Injectable()
export class PatientService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  async findAll(filters) {
    const cacheKey = `patients:${JSON.stringify(filters)}`;
    
    // 1. Intenta cache
    let patients = await this.cacheManager.get(cacheKey);
    
    // 2. Si miss → query DB
    if (!patients) {
      patients = await this.patientRepository.find(filters);
      
      // 3. Guarda en cache con TTL
      await this.cacheManager.set(cacheKey, patients, 300000); // 5 min
    }
    
    return patients;
  }

  // 4. Invalidar cache al mutación
  async update(id, dto) {
    await this.patientRepository.update(id, dto);
    
    await this.cacheManager.reset();  // Invalida TODO
    // O más específico:
    await this.cacheManager.del(`patients:${...}`);
  }
}
```

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

### Transacciones

Para operaciones multi-tabla:

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

En `PatientService`:

```typescript
async findAll(userId: string, role: Role) {
  const query = this.patientRepository
    .createQueryBuilder('p')
    .where('p.deletedAt IS NULL');
  
  // Si usuario es doctor → filtra pacientes del doctor
  if (role.name === 'Doctor') {
    query
      .leftJoin('p.medicalAppointments', 'apt')
      .leftJoin('apt.doctor', 'doc')
      .andWhere('doc.userId = :userId', { userId });
  }
  
  return query.getMany();
}
```

### Validación Global

En `main.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    transform: true,      // Convierte tipos automáticamente
    whitelist: true,      // Rechaza propiedades no decoradas
    forbidNonWhitelisted: true,  // Lanza error si hay extras
    skipMissingProperties: false,
    validationError: {
      target: true,
      value: true
    }
  })
);
```

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

Archivo `.env.example`:

```ini
# Aplicación
PORT=7008
NODE_ENV=development
URL_HOST=localhost

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=taurydes
DB_PASS=dt.482284
DB_NAME=bd_gestion_medica

# Redis (Colas BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379

# Redis (Sesiones)
REDIS_SESSION_HOST=localhost
REDIS_SESSION_PORT=6379
REDIS_SESSION_PASS=

# JWT
JWT_SECRET=secret
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=refresh_secret
JWT_REFRESH_EXPIRES_IN=7d

# Email
EMAIL_HOST=mailpit
EMAIL_PORT=1025
EMAIL_SECURE=false
EMAIL_USER=usuario
EMAIL_PASS=clave

# Seguridad
TOKEN_VALIDATOR=1a2b3c4d...
ENCRYPT_KEY=eyJhbGci...
PERMISSIONS_SECRET=secretkey

# Archivos
UPLOADS_PATH=./uploads
MAX_FILE_SIZE=52428800  # 50MB
MAX_IMAGE_SIZE=5242880  # 5MB
MAX_VIDEO_SIZE=26214400 # 25MB

# Colas
BULL_BOARD_PORT=9999

# CORS
CORS_ORIGIN=http://localhost:4200,https://app.example.com

# Zona horaria
TZ=America/Caracas
```

### Validación con Joi

En `src/configuration/validation.ts`:

```typescript
const schema = Joi.object({
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  REDIS_HOST: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  EMAIL_HOST: Joi.string().required(),
  TOKEN_VALIDATOR: Joi.string().required(),
  // ... más campos
});
```

Si falta variable requerida → app no arranca.

### app.config.ts

En `main.ts` se aplica configuración global:

```typescript
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // View engine para logs y Bull Board
  app.setBaseViewsDir('src/logs/views');
  app.setViewEngine('hbs');
  
  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(','),
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization']
  });
  
  // Body size limits
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));
  
  // Swagger (solo dev)
  if (process.env.NODE_ENV === 'development') {
    const config = new DocumentBuilder()
      .setTitle('API Gestión Médica')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }
  
  // Guards globales en orden
  app.useGlobalGuards(jwtAuthGuard, sessionGuard, permissionsGuard);
  
  // Pipes globales
  app.useGlobalPipes(validationPipe);
  
  // Interceptores globales
  app.useGlobalInterceptors(httpResponseInterceptor);
  
  // Filtros globales
  app.useGlobalFilters(httpExceptionFilter);
  
  // Servir archivos estáticos
  app.use('/uploads', express.static('uploads'));
  
  // Bull Board (admin panel)
  setupBullBoard(app);
  
  await app.listen(process.env.PORT || 7008);
}

bootstrap();
```

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
│  ├─ Genera appointmentNumber único
│  ├─ Guarda en BD
│  └─ Invalida cache
├─ HttpResponseInterceptor estandariza respuesta
└─ RESPONSE { code: 201, data: { id, appointmentNumber, ... } }
```

### Flujo: Finalizar Consulta (Crear Historial + Receta)

```
PATCH /medical-appointments/:id/finish-consultation
├─ Valida DTO (CompleteConsultationDto)
├─ Verifica permisos: @Permission('appointments.crear') [crear diagnóstico]
├─ QueryRunner inicia transacción
├─ Crea MedicalHistory
│  ├─ Registra signos vitales (presión, pulso, temp, etc.)
│  ├─ Registra diagnóstico + código CIE-10
│  ├─ Registra plan de tratamiento
│  └─ Genera consultationNumber único
├─ [Si se proporcionan medicamentos] Crea Recipe
│  ├─ Crea ítems de receta (medicamento + dosis)
│  └─ Asigna a paciente + historial
├─ Actualiza MedicalAppointment.status = COMPLETED
├─ QueryRunner commit transacción
├─ Respuesta: { historialId, recipeId }
└─ Frontend sube archivos (mamografías) via POST /files/appointment-upload
```

### Flujo: Login

```
POST /auth/login { credential, password, isSystemUser }
├─ @Public() → bypass JwtAuthGuard
├─ AuthService.loginWithCredentials()
│  ├─ isSystemUser=true → consulta UserSecurity (schema seguridad)
│  ├─ isSystemUser=false → consulta User (schema public)
│  ├─ Verifica password con bcrypt.compare()
│  ├─ JwtService.sign(payload)
│  │  └─ access_token + refresh_token
│  ├─ RedisSessionService.createSession()
│  │  └─ Almacena en Redis con TTL 3600s
│  └─ Retorna tokens + usuario
├─ HttpResponseInterceptor estandariza
└─ RESPONSE { code: 200, data: { access_token, refresh_token, user } }
```

### Flujo: Refresh Token

```
POST /auth/refresh { refreshToken }
├─ @Public() → bypass JwtAuthGuard
├─ AuthService.refreshTokens()
│  ├─ Valida que refreshToken sea válido (JwtService.verify)
│  ├─ Busca en Redis la sesión del usuario
│  ├─ Verifica que el token enviado coincida
│  ├─ Si coincide: genera nuevo access_token
│  └─ Si no coincide: lanza UnauthorizedException (401)
└─ RESPONSE { code: 200, data: { access_token, refresh_token } }
```

### Flujo: Get Permisos de Usuario

```
GET /auth/me
├─ JwtAuthGuard: verifica token
├─ SessionGuard: verifica Redis
├─ PermissionsGuard: permite (sin @Permission requerido)
├─ AuthService.getUserWithPermissions(userId)
│  ├─ Carga usuario + rol
│  ├─ PermissionService.getUserPermissions(userId)
│  │  ├─ Consulta PermissionMenu
│  │  ├─ Construye permisos: ["patient.crear", "appointments.ver", ...]
│  │  ├─ Construye menús en árbol
│  │  └─ Cifra módulos con AES-256-CBC
│  ├─ Retorna: { user, role, permissions, menus, medicalCenters }
├─ Permisos se envían cifrados
└─ Frontend los desencripta
```

---

## Dependencias Externas

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `@nestjs/common` | ^11.0.1 | Framework core |
| `@nestjs/core` | ^11.0.1 | DI + Module system |
| `@nestjs/typeorm` | ^11.0.0 | Integración ORM |
| `typeorm` | ^0.3.20 | ORM |
| `pg` | ^8.13.3 | Driver PostgreSQL |
| `@nestjs/jwt` | ^11.0.0 | JWT |
| `@nestjs/passport` | ^11.0.5 | Passport integration |
| `passport-jwt` | ^4.0.1 | JWT strategy |
| `bcrypt` | ^5.1.1 | Hash de contraseñas |
| `@nestjs/bullmq` | ^11.0.4 | Integración BullMQ |
| `bullmq` | ^5.63.0 | Colas Redis |
| `@bull-board/*` | ^6.14.1 | Panel de colas |
| `@nestjs/cache-manager` | ^3.0.1 | Cache |
| `cache-manager-redis-store` | ^3.0.1 | Store Redis |
| `redis` | ^4.7.1 | Cliente Redis |
| `ioredis` | ^5.8.2 | Driver Redis alternativo |
| `@nestjs/throttler` | ^6.4.0 | Rate limiting |
| `@nestjs/swagger` | ^11.2.6 | Documentación API |
| `@nestjs/terminus` | ^11.0.0 | Health checks |
| `@nestjs/config` | ^4.0.2 | Config management |
| `@nestjs/serve-static` | ^5.0.4 | Servir archivos estáticos |
| `class-validator` | ^0.14.1 | Validación DTOs |
| `class-transformer` | ^0.5.1 | Transformación DTOs |
| `joi` | ^18.0.1 | Validación env vars |
| `nodemailer` | ^7.0.10 | Envío emails |
| `pdfkit` | ^0.17.2 | Generación PDFs |
| `exceljs` | ^4.4.0 | Generación Excel |
| `sharp` | ^0.34.5 | Procesamiento imágenes |
| `fluent-ffmpeg` | ^2.1.3 | Validación videos |
| `moment` | ^2.30.1 | Manejo fechas |
| `hbs` | ^4.2.0 | Templates Handlebars |
| `cookie-parser` | ^1.4.7 | Parseo de cookies |
| `axios` | ^1.13.2 | HTTP client |
| `xml2js` | ^0.6.2 | Parseo XML |

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

### Mejores prácticas

- **Soft delete siempre:** `deletedAt` + `isActive = false`
- **Cache para consultas frecuentes:** TTL 5 min para listas, 10 min para un registro
- **Transacciones para operaciones múltiples:** `QueryRunner.startTransaction()`
- **Validación en DTOs:** Usar class-validator, nunca en controlador
- **Permisos granulares:** `@Permission('modulo.accion')` en cada endpoint
- **Protección IDOR:** Filtrar resultados según usuario autenticado
- **Logging centralizado:** Excepciones guardadas en BD automáticamente
- **Documentación Swagger:** Decoradores `@ApiOperation`, `@ApiResponse`

---

**Versión del documento:** 1.0  
**Última actualización:** 2026-05-16  
**Mantenido por:** Equipo de Backend
