# 🛠️ User Management API - NestJS & PostgreSQL

Este proyecto es una **API RESTful** construida con **NestJS**, **TypeORM** y **PostgreSQL**. Proporciona funcionalidades CRUD para la gestión de usuarios con autenticación JWT.

## 🚀 Características

✅ Creación, actualización, eliminación y listado de usuarios  
✅ Autenticación con JWT (JSON Web Token)  
✅ Hashing de contraseñas con `bcrypt`  
✅ Validaciones con `class-validator`  
✅ Documentación con **Swagger**  
✅ Persistencia de datos en **PostgreSQL**  

---

## 📌 Instalación y Configuración

### 1️⃣ Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/tu-repositorio.git
cd tu-repositorio

2️⃣ Instalar dependencias

npm install

3️⃣ Configurar variables de entorno

Crea un archivo .env en la raíz del proyecto con la siguiente configuración:

# Puerto de la API
PORT=3000

# Configuración de la base de datos PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=tu_contraseña
DB_NAME=users_db

# Clave secreta para JWT
JWT_SECRET=tu_secreto_super_seguro
JWT_EXPIRES_IN=1h

    ⚠️ Asegúrate de tener PostgreSQL corriendo en tu máquina.

4️⃣ Ejecutar migraciones (Opcional si usas synchronize: true)

npm run typeorm migration:run

5️⃣ Iniciar el servidor

npm run start:dev

📌 Endpoints

La API expone los siguientes endpoints:
🔐 Autenticación
Método	Ruta	Descripción
POST	/auth/login	Inicio de sesión (Retorna JWT)
👥 Usuarios
Método	Ruta	Descripción
GET	/users	Obtener todos los usuarios (requiere autenticación)
GET	/users/:id	Obtener un usuario por ID
PATCH	/users/:id	Actualizar usuario
DELETE	/users/:id	Eliminar usuario

📄 Swagger UI disponible en:

http://localhost:3000/api

📌 Estructura del Proyecto

📂 src
 ├── 📂 auth               # Módulo de autenticación
 │    ├── auth.module.ts
 │    ├── auth.service.ts
 │    ├── auth.controller.ts
 │    ├── jwt.strategy.ts
 │    ├── dto
 ├── 📂 user               # Módulo de usuarios
 │    ├── user.module.ts
 │    ├── user.service.ts
 │    ├── user.controller.ts
 │    ├── entities
 ├── 📂 config             # Configuración de la base de datos
 ├── 📂 common             # Middlewares, filtros y guards
 ├── main.ts               # Punto de entrada de la app
 ├── app.module.ts         # Módulo principal
 ├── .env                  # Variables de entorno
 ├── README.md             # Documentación

 ## Autor

Este proyecto fue creado por:
- Daniel Toro(https://github.com/taurydes)
 
