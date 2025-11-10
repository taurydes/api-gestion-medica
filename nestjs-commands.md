# 🧩 User Management API — NestJS, PostgreSQL & BullMQ

API RESTful robusta construida con **NestJS**, **TypeORM**, **PostgreSQL** y **BullMQ**, con autenticación JWT, colas de trabajo, logging avanzado y un panel administrativo con **Bull Board** protegido por login.

---

## 🚀 Características principales

✅ **Gestión de usuarios completa (CRUD)**  
✅ **Autenticación JWT** con guardias y decoradores personalizados  
✅ **Hashing seguro** de contraseñas con `bcrypt`  
✅ **Validación avanzada** de DTOs (`class-validator`, `class-transformer`)  
✅ **Persistencia** con TypeORM + PostgreSQL  
✅ **Documentación** integrada con **Swagger**  
✅ **Sistema de logs visual (Handlebars UI)**  
✅ **Procesamiento asíncrono de colas** con **BullMQ + Redis**  
✅ **Panel Bull Board** para monitorear jobs en tiempo real  
✅ **Protección del panel Bull Board** con login y token JWT dedicado  

---

## ⚙️ Instalación y Configuración

### 1️⃣ Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/tu-repositorio.git
cd tu-repositorio
```

### 2️⃣ Instalar dependencias
```bash
npm install
```

### 3️⃣ Variables de entorno (`.env`)
Crea un archivo `.env` en la raíz del proyecto con la siguiente configuración:

```bash
# 🌐 Servidor
PORT=7008
URL_HOST=localhost
NODE_ENV=development

# 🔐 Autenticación JWT
JWT_SECRET=super_secret_jwt_key
JWT_EXPIRES_IN=1h

# 🗄️ Base de datos PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=tu_contraseña
DB_NAME=users_db

# 🧠 Redis (para BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379

# 📧 Bull Board (panel administrativo)
USER_BULL=admin
PASSWORD_BULL=123456
JWT_SECRET_BULL=bull_secret

# 🧾 Logs
LOGS_PATH=logs/
```

⚠️ Asegúrate de tener **PostgreSQL** y **Redis** corriendo antes de iniciar el servidor.

---

## 🧱 Estructura del Proyecto

```
📂 src
 ├── 📂 auth                  # Módulo de autenticación JWT
 │    ├── guards/
 │    ├── decorators/
 │    ├── dto/
 │    ├── auth.service.ts
 │    ├── auth.controller.ts
 │    └── jwt.strategy.ts
 │
 ├── 📂 user                  # CRUD de usuarios
 │    ├── entities/
 │    ├── dto/
 │    ├── user.service.ts
 │    └── user.controller.ts
 │
 ├── 📂 queues                # Módulo de colas BullMQ
 │    ├── queues.module.ts
 │    ├── queues.service.ts
 │    ├── 📂 bull-board       # Panel visual Bull Board
 │    │     ├── bull-board.controller.ts
 │    │     ├── bull-board.service.ts
 │    │     ├── bull-board.module.ts
 │    │     └── 📂 views/     # Plantillas Handlebars (login)
 │    └── email.processor.ts  # Worker de envío de correos
 │
 ├── 📂 logs                  # Logs del sistema (UI + persistencia)
 │    ├── logs.module.ts
 │    ├── logs.controller.ts
 │    ├── logs.service.ts
 │    └── 📂 views/           # Plantillas .hbs para login y dashboard
 │
 ├── 📂 common                # Filtros, interceptores, pipes globales
 │    ├── interceptors/
 │    ├── exceptions/
 │    └── decorators/
 │
 ├── app.module.ts            # Módulo raíz
 ├── main.ts                  # Punto de entrada principal
 ├── README.md
 └── .env
```

---

## 📡 Ejecución del proyecto

### ▶️ Desarrollo
```bash
npm run start:dev
```

### 🧱 Producción
```bash
npm run build
npm run start:prod
```

---

## 📄 Documentación Swagger

Disponible automáticamente en:
> 🔗 http://localhost:7008/api

---

## 🔐 Autenticación y Endpoints Principales

### Auth
| Método | Ruta | Descripción |
|--------|------|--------------|
| **POST** | `/auth/login` | Iniciar sesión y obtener un JWT |
| **GET** | `/auth/profile` | Obtener datos del usuario autenticado |

### Users
| Método | Ruta | Descripción |
|--------|------|--------------|
| **GET** | `/users` | Listar todos los usuarios |
| **GET** | `/users/:id` | Obtener usuario por ID |
| **POST** | `/users` | Crear nuevo usuario |
| **PATCH** | `/users/:id` | Actualizar usuario |
| **DELETE** | `/users/:id` | Eliminar usuario |

---

## 🧠 Logs UI

> 📍 **Ruta:** `http://localhost:7008/logs/ui/login`

Interfaz visual (Handlebars) que permite visualizar logs del sistema en tiempo real.  
Solo accesible para **usuarios con rol de superAdministrador** (roleId = 1).  
Integra autenticación JWT y persistencia en base de datos.

---

## 📦 Bull Board Panel

> 📍 **Ruta de login:** `http://localhost:7008/admin/login`  
> 📍 **Ruta del panel:** `http://localhost:7008/admin/queues`

Panel de administración visual para **BullMQ**, con autenticación propia (`USER_BULL` / `PASSWORD_BULL`).

Permite:
- Visualizar colas y trabajos activos/fallidos
- Reintentar, eliminar o limpiar jobs
- Monitorear métricas en tiempo real
- Autenticación protegida con JWT y cookies httpOnly

---

## 📨 Procesamiento de correos

El worker `EmailProcessor` ejecuta tareas en segundo plano desde la cola `emailQueue`.  
Ejemplo de uso:

```ts
await this.emailQueue.add('sendMail', {
  type: 'template',
  dto: { to: 'cliente@dominio.com', subject: 'Bienvenido' },
  replacements: { nombre: 'Carlos' },
});
```

---

## 🧰 Herramientas y Tecnologías

| Categoría | Tecnología |
|------------|-------------|
| Framework | **NestJS** |
| ORM | **TypeORM** |
| Base de datos | **PostgreSQL** |
| Colas | **BullMQ** + **Redis** |
| UI de colas | **Bull Board** |
| Vistas | **Handlebars (hbs)** |
| Documentación | **Swagger** |
| Seguridad | **JWT + Guards + Cookies** |
| Logging | **Custom Logs + UI visual** |

---

## 👨‍💻 Autor

**Daniel Toro**  
🔗 [GitHub: taurydes](https://github.com/taurydes)
