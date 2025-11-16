# Proyecto: Sistema de Publicidades Android (API + APK)
# Instrucciones y contexto para GitHub Copilot

## 1. Descripción general

Este proyecto implementa un backend **NestJS** para administrar un sistema de **publicidades reproducidas en dispositivos Android (kioskos)**.

Incluye:

- Gestión de contenido publicitario (videos, imágenes, playlists).
- Configuración de kioskos físicos.
- Horarios de reproducción.
- Planes publicitarios.
- Sincronización entre API y dispositivos Android (APK).
- Módulos transversales de seguridad, roles, permisos, auditoría y sesiones.

El lenguaje principal es **TypeScript**  
Los comentarios deben ser **en español**  
Las entidades usan nombres en **inglés** pero mapeadas a columnas en español con `@Column({ name: ... })`.

---

## 2. Arquitectura actual

La API está construida con:

- **NestJS + TypeScript**
- **TypeORM + PostgreSQL**
- **Redis** para:
  - Caché
  - Manejo de sesión única por usuario
- **Docker** para base de datos, redis y servicios
- **Swagger** para documentación
- **BullMQ** para tareas asíncronas (correo, eventos)

Variables de entorno validadas con **Joi**.

---

## 3. Módulos existentes en la API

### 3.1 Autenticación (Auth)
- JWT + refresh token  
- Sesión única por usuario usando Redis (`RedisSessionService`)
- Guards:
  - `JwtAuthGuard`
  - `SessionGuard`
  - `JwtExternalGuard`
- Decoradores:
  - `@Public()`
  - `@GetUser()`

### 3.2 Usuarios (User)
Entidades:

- `User`
- `UserSecurity`
- `CommonPerson`
- `IdentityDocument`

Incluye CRUD, validación con DTOs, cache y auditoría.

### 3.3 Roles y permisos (RBAC)
- `Role`
- `Permission`
- `PermissionRole`
- `PermissionMenu`
- `Menu`

Menús dinámicos asignados según rol del usuario.

Guard personalizado: `PermissionsGuard`.

### 3.4 Logs
- Entidad `ErrorLog`
- Filtro global que registra errores en BD
- Dashboard para revisar errores

### 3.5 BullMQ
- Configuración de colas
- Procesador de correos
- Panel `/admin/queues`

### 3.6 Health
- `/health` via Terminus
- Verifica DB, Redis y colas

---

## 4. Base de datos

Conexión principal:

DatabaseConnectionName.DB_MAIN


Esquemas principales:

- **seguridad**
- **parametro**
- **publicidad** (próximo)
- **dispositivo** (próximo)

Patrón común en todas las tablas:

- `created_at`
- `updated_at`
- `deleted_at`

---

## 5. Módulo Parameters (schema: parametro)
Este módulo fue completamente reestructurado.

Contiene las entidades:

- `Availability`
- `CivilStatus`
- `Gender`
- `IdentityDocument`
- `Municipality`
- `Parish`
- `State`
- `Queue`
- `Kiosko`
- `ScheduleProgram`
- `DayOfWeek`
- `VideoPublicity`

Cada entidad cuenta con:

- DTOs `Create`, `Update`, `Pagination`
- Servicios con:
  - CRUD completo
  - Soft delete
  - Paginación
  - Filtros dinámicos
- Controllers documentados con Swagger

Relaciones destacadas:

State → OneToMany → Municipality → OneToMany → Parish


---

## 6. Extensión del sistema (publicidades y kioskos Android)

El proyecto evolucionará hacia los siguientes módulos:

### 6.1 Kioskos (Dispositivos Android)
Entidad propuesta:

- ID interno
- Nombre / código
- Ubicación
- Estado del dispositivo
- Última sincronización
- Logs del kiosko

Endpoints:

- Registro de kiosko
- Consulta de su playlist
- Reporte de estado

### 6.2 Contenido publicitario
Entidad `AdContent`:

- Título
- Descripción
- Tipo (video, imagen)
- URL o ruta en storage
- Duración
- Estado (activo/inactivo)

### 6.3 Planes de publicidad
Entidad `AdPlan` con:

- Nombre
- Duración
- Repeticiones
- Costo (si aplica)

### 6.4 Horarios (Schedules)
Entidad `Schedule`:

- Hora inicio / hora fin
- Días de la semana
- Kiosko asociado
- Contenido o plan asociado

### 6.5 Sincronización con la APK Android

El backend proveerá:

- `/device/login`  
- `/device/sync` → envía playlist con horarios  
- `/device/report` → diagnosticos del kiosko  

Autenticación con un rol especial o token dedicado.

---

## 7. Convenciones que Copilot debe respetar

### 7.1 Estilo NestJS
- Generar módulos, servicios, controladores y DTOs correctamente
- Servicios usan repositorios TypeORM con `@InjectRepository`
- Controladores usan DTOs y decoradores (`@Body`, `@Param`, `@Query`)

### 7.2 Entidades TypeORM
- Propiedades en **inglés**
- Columnas en **español**
- Relaciones siempre definidas (`OneToMany`, `ManyToOne`, etc.)
- Schema explícito (`schema: 'parametro'` o el que corresponda)

### 7.3 DTOs
- Validación con:
  - `class-validator`
  - `class-transformer`
- Documentación con Swagger
- Paginations:
  - Heredan de `PaginationDto`
  - Pueden incluir filtros por:
    - `description`
    - `isActive`
    - `stateId`, `municipalityId`, etc.

### 7.4 Servicios
- Manejar errores con:
  - `BadRequestException`
  - `NotFoundException`
  - `InternalServerErrorException`
- Usar `queryBuilder` para filtros avanzados y paginación

### 7.5 Seguridad
- No exponer datos sensibles
- Guards para:
  - JWT
  - Permisos
  - Sesiones Redis

### 7.6 Documentación y comentarios
- **Todo en español**
- Describir reglas de negocio
- Usar JSDoc/TSDoc

---

## 8. Resumen corto (para Copilot)

- Backend NestJS + TypeORM con Postgres y Redis.
- Funciona como API central para un sistema de publicidades en kioskos Android.
- Ya existen módulos completos de:
  - Auth, usuarios, roles, menús, logs, colas y health.
- **El módulo "Parameters" está totalmente limpio y estructurado** con:
  - Entities, DTOs, Services y Controllers.
  - Paginación, filtros y soft delete.
- Copilot debe generar código consistente con estos módulos.
- Expansión futura: kioskos, contenidos, planes, horarios y sincronización para APK.

