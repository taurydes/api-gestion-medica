# 🛠️ API BASE — NestJS, PostgreSQL, Redis, JWT

API REST construida con **NestJS** + **TypeORM** + **PostgreSQL** con:
- Autenticación **JWT**
- **Sesiones en Redis** (single-session por usuario)
- **Rate limiting** con Throttler
- **Cache Redis** (manual por servicio)
- **Roles/Permisos** con guard global
- **Bull Board** (panel de colas) y **Logs UI**
- Configuración centralizada con `@nestjs/config` + **validación de .env**

---

## 🚀 Características

- ✅ CRUD de **Usuarios**, **Roles** y **Permisos**
- 🔐 **JWT** + **JwtAuthGuard**
- 🧠 **Sesión activa en Redis** + **SessionGuard** (verifica que el userId tenga sesión válida)
- 🚫 **Single-Session:** al loguear, se cierra la sesión anterior del usuario
- 🧩 **PermissionsGuard** (restringe por rol/permisos)
- ⚡ **Throttler** (anti-abuso/DoS a nivel global y por ruta)
- 📦 **Cache Redis** (vía `CacheModule` + `cache-manager-redis-store`, uso **manual** en servicios)
- 📘 **Swagger** (solo en `NODE_ENV=development`)
- 🩺 **/health**
- 📊 **Bull Board** en `/admin/queues` con login en `/admin/login`
- 🧠 **Logs UI** en `/logs/ui/login` y `/logs/ui/view`

---

## 📁 Estructura del proyecto

```
src/
├─ auth/
│  ├─ decorators/
│  ├─ dto/
│  ├─ guards/
│  │  ├─ jwt-auth.guard.ts
│  │  ├─ permission.guard.ts
│  │  └─ session.guard.ts
│  ├─ interfaces/
│  ├─ auth.controller.ts
│  ├─ auth.module.ts
│  └─ auth.service.ts
├─ common/
│  ├─ exceptions/HttpExceptionFilter.ts
│  ├─ interceptors/HttpResponseInterceptor.ts
│  └─ ...
├─ configuration/
│  ├─ index.ts                 # configuration() + validationSchema
│  └─ (opcional) validation.ts
├─ database/
│  ├─ DatabaseConnectionName.ts
│  └─ getMainConnection.ts
├─ email/
├─ health/
├─ logs/
│  ├─ logs.module.ts
│  ├─ logs.service.ts
│  └─ views/
│     ├─ helpers.ts
│     ├─ logs-page.css
│     └─ (hbs) ui, login, etc.
├─ permission/
│  ├─ dto/
│  ├─ entities/
│  ├─ permission.controller.ts
│  ├─ permission.module.ts
│  └─ permission.service.ts
├─ queues/
│  ├─ bull-board/
│  │  ├─ bull-board.module.ts
│  │  ├─ bull-board.controller.ts
│  │  └─ views/bull-login.hbs
│  ├─ queues.module.ts
│  └─ queues.service.ts
├─ redis-session/
│  ├─ redis-session.module.ts
│  ├─ redis-session.provider.ts
│  └─ redis-session.service.ts
├─ role/
│  ├─ dto/
│  ├─ entities/
│  ├─ role.controller.ts
│  ├─ role.module.ts
│  └─ role.service.ts
├─ user/
│  ├─ dto/
│  ├─ entities/
│  ├─ user.controller.ts
│  ├─ user.module.ts
│  └─ user.service.ts
├─ app.module.ts
└─ main.ts
```

---

## 🧩 Configuración (.env)

Ejemplo actualizado:

```env
# ---------------------------
# App
# ---------------------------
APP_NAME=API BASE - TypeScript + NestJS
PORT=7008
NODE_ENV=development
URL_HOST=localhost
CORS_ORIGIN=http://localhost:3000

# ---------------------------
# DB
# ---------------------------
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=123456
DB_NAME=bd_metro_ads

# ---------------------------
# Redis (cache y colas)
# ---------------------------
REDIS_HOST=192.168.4.66
REDIS_PORT=6379

# Redis de sesiones
REDIS_SESSION_HOST=192.168.4.66
REDIS_SESSION_PORT=6379
REDIS_SESSION_PASS=

# Cache defaults
CACHE_TTL=3600
CACHE_MAX=1000

# ---------------------------
# JWT App
# ---------------------------
JWT_SECRET=secret
JWT_EXPIRES_IN=1h

# ---------------------------
# Bull Board (si usas login propio)
# ---------------------------
USER_BULL=admin
PASSWORD_BULL=123456
JWT_SECRET_BULL=bull_secret

# ---------------------------
# Mail (opcional)
# ---------------------------
EMAIL_HOST=mailpit
EMAIL_PORT=1025
EMAIL_SECURE=false
EMAIL_USER=usuario
EMAIL_PASS=clave

# ---------------------------
# Otros
# ---------------------------
TOKEN_VALIDATOR=1a2b3...
BULL_BOARD_PORT=9999
TZ=America/Caracas
```

> La carga + validación del `.env` se hace con `ConfigModule.forRoot({ isGlobal: true, load: [configuration], validationSchema })`.

---

## 🧱 Seguridad / Guards

**Orden global en `main.ts`:**

1) `JwtAuthGuard` → valida el **JWT** (header/cookie) y coloca `req.user`  
2) `SessionGuard` → consulta **Redis** y verifica **sesión activa** por `user.id`  
3) `PermissionsGuard` → verifica **rol/permisos**

> Rutas con `@Public()` quedan exentas.

**Single-Session:** Al loguear, `AuthService` elimina cualquier sesión previa (`RedisSessionService.deleteSession(userId)`) y guarda la nueva sesión. Cualquier token antiguo queda **inutilizado** por el `SessionGuard`.

---

## ⚡ Throttling (rate limiting)

- Config global en `AppModule` con **tres ventanas**: `short`, `medium`, `long`.
- Se aplica un **guard global `ThrottlerGuard`** y en controladores puedes usar `@Throttle({ short: {} })`.

Protege de **abuso** (bursts, scraping) y ayuda frente a intentos de **DoS** de baja complejidad.

---

## 📦 Cache Redis (manual)

- `CacheModule.registerAsync({ store: redisStore, ... })` **global**.
- Uso **manual** por servicio (ej.: Roles/Permisos/Users), con claves tipo:
  - Lista: `roles:all` / `permissions:all`
  - Detalle: `roles:${id}` / `permissions:${id}`
- En **create/update/delete** se invalidan las claves relacionadas.

> Ventajas: 5–10× más rápido en endpoints de **lectura** repetida (catálogos, permisos, perfiles “populares”).

---

## 🔐 Autenticación

### Endpoints Auth
- `POST /auth/login` → `{ credential, password, isSystemUser? }`  
  Devuelve `access_token`. Guarda sesión en Redis con TTL (p. ej. 1h).
- `POST /auth/logout` → cierra sesión actual en Redis + limpia cookie
- `GET /auth/session` → verifica si la sesión del usuario está activa

Cookies (opcional, web): se setea `access_token` (`httpOnly`, `sameSite=lax`).

---

## 📘 Swagger

Disponible en **desarrollo** en:  
`http://localhost:7008/api`

---

## 📊 Bull Board & Logs UI

- **Bull Board**  
  - Login (propio del panel): `GET/POST /admin/login`  
  - Panel: `GET /admin/queues` y subrutas `GET /admin/queues/*`
  - El controller valida un **token JWT propio** (`bull_token`) o `Authorization: Bearer`, según lo configurado.

- **Logs UI**  
  - Login: `/logs/ui/login`  
  - Vista: `/logs/ui/view` (usa `access_token` — puedes pasarlo por cookie / query / localStorage)

> Si prefieres unificar login con el **AuthService**, puedes hacer que el formulario del panel consuma `POST /auth/login` y use el `access_token` de la app; después, ajusta el middleware de Bull Board para aceptar ese token.

---

## 🧪 Endpoints principales (resumen)

### 🔐 Auth
| Método | Ruta           | Descripción                              |
|-------:|----------------|------------------------------------------|
| POST   | /auth/login    | Login (JWT + sesión Redis)               |
| POST   | /auth/logout   | Logout (borra sesión en Redis)           |
| GET    | /auth/session  | Verificar sesión activa                  |

### 👤 Users
| Método | Ruta           | Descripción                              |
|-------:|----------------|------------------------------------------|
| GET    | /users         | Listar usuarios                          |
| GET    | /users/:id     | Obtener usuario                          |
| PATCH  | /users/:id     | Actualizar usuario                       |
| DELETE | /users/:id     | Eliminar usuario                         |

### 🛡️ Roles
| Método | Ruta       | Descripción                       |
|-------:|------------|-----------------------------------|
| GET    | /roles     | Listar roles (cache)              |
| GET    | /roles/:id | Obtener rol (cache)               |
| POST   | /roles     | Crear rol (invalida cache)        |
| PATCH  | /roles/:id | Actualizar rol (invalida cache)   |
| DELETE | /roles/:id | Eliminar rol (invalida cache)     |

### 🔑 Permisos
| Método | Ruta                | Descripción                                |
|-------:|---------------------|--------------------------------------------|
| GET    | /permissions        | Listar permisos (cache)                    |
| GET    | /permissions/:id    | Obtener permiso (cache)                    |
| POST   | /permissions        | Crear permiso (invalida cache)             |
| PATCH  | /permissions/:id    | Actualizar permiso (invalida cache)        |
| DELETE | /permissions/:id    | Eliminar permiso (invalida cache)          |
| POST   | /permissions/assign | Asignar permisos a rol (invalida cache)    |

### 🩺 Health
| Método | Ruta     | Descripción      |
|-------:|----------|------------------|
| GET    | /health  | Liveness/ready   |

### 🧰 Admin
| Método | Ruta                 | Descripción              |
|-------:|----------------------|--------------------------|
| GET    | /admin/login         | Login Bull Board (UI)    |
| POST   | /admin/login         | Login Bull Board         |
| GET    | /admin/queues        | Panel Bull Board         |
| GET    | /admin/queues/*      | Subrutas panel           |
| GET    | /logs/ui/login       | Login Logs UI            |
| GET    | /logs/ui/view        | Vista Logs UI            |

---

## ▶️ Arranque

```bash
# 1) Dependencias
npm install

# 2) .env
cp .env.example .env  # (o crea uno como el ejemplo de arriba)

# 3) Dev
npm run start:dev
```

**Swagger:** `http://localhost:7008/api`

---

## 🧪 cURL rápidos

```bash
# Login (usuario normal)
curl -X POST http://localhost:7008/auth/login   -H "Content-Type: application/json"   -d '{"credential":"juan@demo.com","password":"123456"}'

# Ver sesión
curl -H "Authorization: Bearer <ACCESS_TOKEN>"   http://localhost:7008/auth/session

# Roles (cache)
curl -H "Authorization: Bearer <ACCESS_TOKEN>"   http://localhost:7008/roles
```

---

## 🧠 Notas técnicas

- **Config vs process.env**: usamos **`ConfigService`** en la app. Ventajas:
  - Centraliza lectura de variables y **valida** el `.env`
  - Facilita **tests** y **overrides** por entorno
  - Evita `process.env` disperso y errores de tipeo

- **Cache manual**: decidimos dónde aplicar cache (ej.: `findAll`, `findOne`) y dónde invalidarlo (create/update/delete). Control total sobre TTL y claves.

- **Medición de mejoras**: añade un interceptor de timing para comparar endpoints con y sin cache. Redis típico 0.2–1ms; consultas reales de DB pueden ser 20–200ms+.
