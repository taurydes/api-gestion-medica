# Proyecto: Kiosko de Publicidades Android (API + APK)
# Instrucciones y contexto para GitHub Copilot

## 1. Descripción general del proyecto

Este proyecto consiste en un sistema de **publicidades en dispositivos Android**:

- Se generará una **APK** que reproducirá videos publicitarios en kioskos / dispositivos Android.
- Habrá una **API backend (NestJS)** que gestionará:
  - Horarios de reproducción (schedules / time slots).
  - Planes de publicidad.
  - Catálogo de contenidos (videos, imágenes, etc.).
  - Dispositivos / kioskos y su configuración.
  - Usuarios, roles, permisos y autenticación.
  - Auditoría básica (logs, errores, actividades relevantes).

La API que se usa actualmente es una **API base** ya funcional sobre la que se irá extendiendo la lógica de negocio específica de **publicidad y kioskos**.

Lenguaje principal: **TypeScript**.  
Comentarios y textos de negocio: **en español**, usando nombres de entidades en inglés pero reflejando el nombre real de la tabla/columna en español cuando aplique.

---

## 2. Stack y arquitectura actual (API base)

La API actual está construida con:

- **NestJS + TypeScript**
- **TypeORM** con **PostgreSQL** (múltiples esquemas, p. ej. `seguridad`, `parametro`, etc.).
- **Redis** para:
  - Cache general (cache-manager).
  - Manejo de sesiones de usuario (sesión única por usuario).
- **Docker / docker-compose** para levantar:
  - Base de datos.
  - Redis.
  - API.

Configuración:

- Uso de `@nestjs/config` y validación de variables de entorno con **Joi**.
- Módulo de base de datos usando `DatabaseConnectionName.DB_MAIN`.

---

## 3. Módulos principales existentes

### 3.1 Auth

- Login con **JWT**.
- Manejo de sesión en Redis vía `RedisSessionService`:
  - Una sola sesión activa por usuario (cuando entra una nueva, se invalida la anterior).
- Usa:
  - `JwtService`.
  - Guards:
    - Guard de JWT.
    - `SessionGuard` para validar sesión en Redis.
    - `JwtExternalGuard` para validar tokens externos.
- Implementa **access token** + **refresh token**.
- Endpoint de `refresh` que:
  - Recibe `userId` + `refreshToken`.
  - Valida contra Redis.
  - Regenera `access_token` y `refresh_token`.
- Decoradores:
  - `@Public()` para omitir autenticación.
  - `@GetUser()` para obtener el usuario desde `req.user`.

### 3.2 User

- Entidades:
  - `User` (usuarios “normales”).
  - `UserSecurity` (usuarios del esquema de seguridad heredado).
  - `CommonPerson` / `persona_comun`.
  - `IdentityDocument` / `documento_identidad`.
- Usuarios con información personal:
  - Documento, nombres, apellidos, teléfonos, direcciones, etc.
- Flags:
  - `status` / `activo`.
  - `internalUser`.
  - `firstLogin`.
- CRUD con DTOs y validaciones.
- Uso de cache Redis para:
  - Lista general de usuarios.
  - Usuario individual.

### 3.3 Roles y permisos

- Entidades:
  - `Role` → tabla `seguridad.roles`.
  - `Permission` → tabla `seguridad.permisos`.
  - `PermissionRole` → tabla `seguridad.permisos_roles`.
  - `PermissionMenu` → tabla `seguridad.permisos_menus`.
  - `Menu` → tabla `seguridad.menu`.
- Sistema RBAC (Role-Based Access Control):
  - Un rol tiene muchos permisos.
  - Permisos vinculados a submenús (`submenu_id`) y menús.
- Servicios:
  - `RoleService` con CRUD y cache.
  - `PermissionService` con CRUD y asignación masiva de permisos a roles (`assignPermissionsToRole`).
  - Menús dinámicos según rol:
    - El `MenuService` arma el árbol de menús basado en `permissions_roles` / `permisos_menus`.
- Guard de permisos:
  - `PermissionsGuard` que consulta el rol del usuario y sus permisos asociados a submenús.

### 3.4 Logs

- Módulo de logs con entidad `ErrorLog`.
- UI de logs con vistas `.hbs` para inspeccionar errores a nivel web.
- `HttpExceptionFilter` registra errores en la base de datos.

### 3.5 Queues / BullMQ

- Integración con **BullMQ** para colas.
- Panel de administración con **Bull Board** (`/admin/queues`).
- Procesador de emails (`email.processor.ts`) para envío de correos asíncronos.

### 3.6 Health

- Módulo de healthcheck con `@nestjs/terminus`.
- Endpoint `/health` para verificar estado de la API y dependencias.

### 3.7 Redis Session

- Módulo `RedisSessionService`:
  - Maneja sesiones únicas en Redis (`session:{userId}`).
  - Métodos:
    - `setSession`
    - `getSession`
    - `deleteSession`
    - `isValidSession`
    - `refreshSession`

---

## 4. Infraestructura y aspectos transversales

- **Rate limiting** con `@nestjs/throttler`.
- **CacheModule global** usando `cache-manager-redis-store`.
- **Swagger / OpenAPI** configurado en `main.ts` para documentar la API.
- **Filtros / interceptores / pipes globales**:
  - `ValidationPipe` con `whitelist` y `transform`.
  - `HttpResponseInterceptor` para homogeneizar respuestas.
  - `HttpExceptionFilter` que además registra en logs.
- Guards globales:
  - Autenticación JWT.
  - Sesión activa en Redis.
  - Permisos vía decoradores `@Permission()`.

---

## 5. Base de datos

- Conexión principal: `DatabaseConnectionName.DB_MAIN`.
- Esquemas:
  - `seguridad` (users, roles, permisos, menu, etc.).
  - `parametro` (documento_identidad, etc.).
- Patrón común de columnas:
  - `created_at`
  - `updated_at`
  - `deleted_at`
- Uso de `@Column({ name: '...' })` para mapear nombres en español de columnas a propiedades en inglés de entidades.

---

## 6. Objetivo de ampliación (publicidades y kioskos Android)

Sobre esta base ya construída, el proyecto se extenderá para manejar:

1. **Dispositivos / Kioskos Android**
   - Entidad para registrar cada dispositivo, con:
     - ID interno.
     - Nombre / descripción.
     - Ubicación opcional.
     - Estado (activo, inactivo, fuera de línea, etc.).
     - Relación con usuario/rol si aplica o un tipo especial de usuario “kiosko”.

2. **Planes de publicidad**
   - Definición de planes con:
     - Nombre del plan.
     - Duración.
     - Precio (si aplica).
     - Cantidad de repeticiones / impresiones.
     - Relación con contenidos y horarios.

3. **Contenido publicitario**
   - Entidad para videos/imágenes (por ahora se manejará como metadata; los archivos pueden estar en un storage externo).
   - Campos:
     - Título / descripción.
     - Tipo (video, imagen).
     - URL de origen.
     - Duración aproximada (segundos).
     - Estado (activo/inactivo).

4. **Horarios / Schedules**
   - Entidad para definir en qué rango de horas y días se muestra cada contenido / plan.
   - Posible modelo:
     - `startTime`, `endTime`.
     - Días de la semana.
     - Relación con kiosko y/o plan.

5. **Asignación contenido → kiosko**
   - Reglas de qué contenidos se muestran en qué dispositivo en qué horario.
   - API que devuelva al kiosko Android:
     - Lista de contenidos activos para ese dispositivo.
     - Orden de reproducción.
     - Tiempos y condiciones.

6. **Sincronización con la APK**
   - Endpoints pensados para que la APK:
     - Se autentique (usuario tipo kiosko o token especial).
     - Consulte su playlist de contenido.
     - Reporte estado (última sincronización, errores, etc.).

---

## 7. Convenciones para Copilot

Cuando generes código (Copilot), por favor respeta:

1. **Stack y estilo**
   - Usar **NestJS** (módulos, servicios, controladores, decoradores).
   - Usar **TypeORM** con `@Entity`, `@Column`, `@ManyToOne`, `@OneToMany`, etc.
   - Usar **PostgreSQL**, respetando esquemas existentes:
     - Ejemplo: `@Entity({ schema: 'seguridad', name: 'users' })`.

2. **Nombres de entidades y columnas**
   - Propiedades de clases en **inglés** (`name`, `status`, `createdAt`, etc.).
   - `@Column({ name: 'columna_en_espanol' })` cuando el nombre real sea español.
   - Entidades nuevas para publicidad deben seguir el mismo patrón:
     - `AdPlan`, `AdContent`, `Device`, `Schedule`, etc.

3. **DTOs y validación**
   - Crear DTOs con `class-validator` y `class-transformer`.
   - Usar `@ApiProperty` para documentar DTOs (Swagger).

4. **Servicios y controladores**
   - Los servicios deben:
     - Manejar errores con `BadRequestException`, `NotFoundException`, `InternalServerErrorException`.
     - Usar repositorios TypeORM (`@InjectRepository`).
   - Los controladores deben:
     - Usar decoradores de Nest (`@Get`, `@Post`, `@Patch`, `@Delete`).
     - Usar DTOs en `@Body()`.
     - Usar `@Param('id')` con `ParseIntPipe` cuando aplique.

5. **Seguridad y autenticación**
   - No incluir datos sensibles en JWT.
   - Al diseñar endpoints para la APK:
     - Pueden usar un rol específico de kiosko o tokens dedicados.
     - Aplicar guards (`AuthGuard`, `SessionGuard`) según el diseño ya implementado.

6. **Menú dinámico según rol**
   - Cuando se generen nuevas opciones de menú para módulos de publicidad:
     - Integrarlas con las entidades `Menu`, `Permission`, `PermissionRole`, `PermissionMenu`.
     - Mantener el sistema actual que arma el menú dinámico según el rol del usuario.

7. **Comentarios**
   - Comentar en **español**, especialmente la lógica de negocio.
   - Usar JSDoc / TSDoc cuando sea útil para describir métodos y servicios.

---

## 8. Resumen corto para Copilot

- Este es un backend NestJS que sirve como **API central** para un sistema de **publicidades en kioskos Android**.
- Ya existe una API base con módulos de **auth, usuarios, roles, permisos, menús, logs, colas y health**.
- Sobre esta base se deben implementar **módulos de dominio de publicidad**:
  - Dispositivos (kioskos Android).
  - Contenido publicitario (videos / imágenes).
  - Planes y horarios.
  - Asignación contenido–dispositivo.
- Mantener consistencia con:
  - NestJS + TypeORM + PostgreSQL (esquemas en español, propiedades en inglés).
  - Redis para cache y sesiones.
  - Sistema de roles y permisos ya existente.
  - Comentarios y documentación en español.

