# Instrucciones del Proyecto — API Gestión Médica (Backend NestJS)

## 1. Arquitectura General

### Stack Tecnológico
- **Framework**: NestJS (TypeScript)
- **Base de Datos**: PostgreSQL con TypeORM
- **Caché/Sesiones**: Redis (CacheModule + RedisSessionService)
- **Colas asíncronas**: BullMQ
- **Autenticación**: JWT (access + refresh token) + sesión única en Redis
- **Documentación**: Swagger (solo en `NODE_ENV=development`)

### Estructura de Carpetas
```
src/
├── auth/              → Autenticación, guards, decoradores, estrategias JWT
├── common/            → Interceptores, excepciones, DTOs base, utilidades
├── common-person/     → Entidad CommonPerson (datos personales compartidos)
├── configuration/     → Configuración global + validación Joi de .env
├── crypto/            → Utilidades de cifrado/hashing
├── dashboard/         → Dashboard administrativo
├── database/          → Conexión TypeORM (getMainConnection, DatabaseConnectionName)
├── departments/       → Departamentos médicos (CRUD, relación con centros)
├── doctors/           → Doctores, horarios (DoctorSchedule), CRUD
├── email/             → Servicio de correo electrónico
├── files/             → Gestión de archivos (videos, imágenes, mamografías)
├── health/            → Health checks (DB, Redis, colas)
├── logs/              → Registro de errores en BD + UI Handlebars
├── medical-appointments/ → Citas médicas (hub central del sistema)
├── medical-center/    → Centros médicos (CRUD, relación con doctores)
├── medical-history/   → Historial médico / consultas
├── menu/              → Menú dinámico por rol
├── parameters/        → Entidades paramétricas (alergias, especialidades, etc.)
├── patient/           → Pacientes (CRUD, relación con persona)
├── permission/        → Permisos RBAC
├── queues/            → Configuración BullMQ
├── recipe/            → Recetas médicas
├── redis-session/     → Sesión única por usuario en Redis
├── role/              → Roles de usuario
└── user/              → Usuarios del sistema
```

## 2. Patrones y Convenciones

### Entidades
- Todas usan `PrimaryGeneratedColumn('uuid')`.
- Campos de auditoría: `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`.
- Soft delete: se setea `deletedAt = new Date()`, nunca se elimina físicamente.
- Propiedades en **inglés**, columnas mapeadas a **español** con `@Column({ name: '...' })` donde la tabla ya lo tiene así.
- Schemas: `public` para entidades principales, `parametro` para parámetros, `seguridad` para auth.

### Conexión a BD
- Conexión principal: `DatabaseConnectionName.DB_MAIN`.
- Inyección de repos: `@InjectRepository(Entity, DatabaseConnectionName.DB_MAIN)`.
- `autoLoadEntities: true`, `synchronize: false` (migraciones fuera del runtime).

### Servicios
- CRUD estándar: `create`, `findAll`, `findOne`, `update`, `remove`.
- Paginación: extienden `QueryPaginationDto` (page, limit, order).
- Soft delete: filtran con `deletedAt IS NULL` o `IsNull()`.
- Números únicos: Patrón `PREFIJO-YYYY-XXXXX` (ej: APT-2026-00001).
- Errores: usan `BadRequestException`, `NotFoundException`, `ForbiddenException`.

### Seguridad (Guards)
Orden global: `JwtAuthGuard` → `SessionGuard` → `PermissionsGuard`.
- `@Public()`: endpoints sin autenticación.
- `@Permission('modulo.accion')`: control RBAC por permisos.
- `@GetUser('id')`: obtiene datos del usuario autenticado.

### IDOR Protection
- Doctores solo ven sus propias citas/pacientes/recetas.
- Helper `getDoctorIdForUser(userId)`: resuelve User → CommonPerson → Doctor.
- Helper `getMedicalCenterIdsForUser(userId)`: lista centros del doctor.
- Cache keys incluyen `effectiveDoctorId` para aislamiento.

### Caché Redis
- Detalle: `resource:${id}` (TTL 600s).
- Paginación: `resource:query:${JSON.stringify(query)}` (TTL 300s).
- Keys registro: `resource:query:keys` para invalidación masiva.
- En CUD: invalidar detalle + `resource:all` + todas las query keys.

### Respuesta estándar
- `HttpResponseInterceptor`: envuelve en `{ code, data }`.
- Errores: `{ data: null, error, statusCode }`.

## 3. Módulos Clave

### Citas Médicas (medical-appointments)
- **Hub central**: vincula paciente, doctor, especialidad, centro, departamento.
- **Estados**: pending → confirmed → in_consultation → completed / cancelled.
- **Flujo de consulta**: 
  1. Crear cita → 2. Iniciar consulta → 3. `finishConsultation()` crea historial + receta + completa cita.
- **Validaciones al crear**:
  - Fecha no puede ser pasada.
  - No solapamiento de horarios del doctor.
  - **Horario del doctor**: valida que tenga schedule configurado en ese centro médico para ese día/hora.
  - **Límite diario**: valida que no se exceda `maxDailyAppointments` del schedule.
- **Endpoints especiales**:
  - `GET /availability?doctorId&date&medicalCenterId`: slots ocupados + info de schedule.
  - `GET /available-dates?doctorId&medicalCenterId&startDate&endDate`: días con cupos disponibles.

### Horarios de Doctores (DoctorSchedule)
- Cada bloque: doctor + centro + díaSemana + horaInicio + horaFin.
- `maxPatientsPerSlot`: máximo pacientes por slot.
- `maxDailyAppointments`: máximo citas por día del doctor en ese centro.
- `slotDurationMinutes`: duración de cada consulta.
- Se setea todo el horario de un doctor en un centro (`setSchedule` reemplaza los anteriores).

### Archivos (files)
- **Archivos de citas médicas** (mamografías, estudios):
  - Endpoint: `POST /files/appointment-upload` (multipart/binario).
  - Almacenamiento: `UPLOADS_PATH/userId/medicalCenterId/appointmentId/`.
  - Entidad: `AppointmentFile` con referencia a cita, historial, paciente.
  - Servir: `GET /files/appointment-files/:fileId` (streaming).
  - Listar: `GET /files/appointment-files?appointmentId=...`.
- **Videos publicitarios**: base64 o multipart con validación ffprobe.

### Historial Médico (medical-history)
- Registra consulta con signos vitales, diagnóstico, tratamiento.
- Número único: `CONS-YYYY-XXXXX`.
- Relación 1:1 con MedicalAppointment.
- Estados: in_progress → completed / cancelled.

## 4. Variables de Entorno Requeridas
```
NODE_ENV, PORT, URL_HOST, TZ
DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME
REDIS_HOST, REDIS_PORT
REDIS_SESSION_HOST, REDIS_SESSION_PORT, REDIS_SESSION_PASS
JWT_SECRET, JWT_EXPIRES_IN
EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE, EMAIL_USER, EMAIL_PASS
TOKEN_VALIDATOR
UPLOADS_PATH
```

## 5. Comandos
- `npm run dev` — Desarrollo con hot-reload
- `npm run start:debug` — Debug mode
- `npm run lint` — ESLint
- `npm test` — Tests unitarios
- Docker: `docker-compose up` (API + Redis)
