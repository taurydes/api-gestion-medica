# Fase 4 — Integración frontend: JWT mínimo, sesión, login y operación (M-56, M-61, M-62, M-63)

- **Base URL:** `http://localhost:8008` (Docker). Sin prefijo global.
- **Auth:** `Authorization: Bearer <access_token>`.
- **Envoltorio:** éxito `{ "code": <status>, "data": <payload> }`; error `{ "data": null, "error": "<mensaje o lista>", "statusCode": <status> }`.
- **Re-login recomendado:** los tokens emitidos antes del despliegue siguen siendo válidos hasta su `exp` (llevan `id`), pero solo un login o un refresh nuevos traen el payload nuevo.

## Qué cambió en esta versión

| Cambio | Acción del frontend |
|---|---|
| El payload del JWT (access y refresh) es solo `{ id, roleId, name, iat, exp }`. Desaparecen `user`, `user.user` (la fila completa del usuario) y el `email` | `decodeAndSetUser` ya lee `id`, `name` y `roleId` del nivel superior: **no requiere cambio** para esos campos. `email` deja de venir en el token (ver nota abajo) |
| Login: usuario inexistente, cuenta inactiva/borrada, rol inactivo y contraseña errónea responden lo mismo: **401 "Credenciales inválidas"** | Mostrar el mensaje tal cual; no hay forma (ni debe haberla) de distinguir los casos |
| La sesión en Redis dura lo que el refresh token (7 días), no 1 hora | Ninguna. Efecto: tras más de 1 h sin actividad, `POST /auth/refresh` ya funciona (antes respondía 401 "Sesión expirada o inválida") |
| `GET /health` responde sin token | Ninguna (uso de monitores) |
| `/api` (Swagger) responde **404** en el contenedor (`NODE_ENV=production`); solo existe en desarrollo local | Ninguna |
| `GET /medical-centers`: `departmentCount` y `doctorCount` ya **no** cuentan departamentos ni médicos borrados; el detalle tampoco los lista | Ninguna; los números pueden bajar |
| La caché es Redis con TTL real (listas 5 min, detalles 10 min). Las escrituras invalidan las vistas afectadas (p. ej. `PATCH /medical-appointments/:id` y luego `GET` del detalle devuelve el cambio) | Ninguna. Si se observa un dato viejo tras una escritura, es un defecto del backend: reportarlo |

### Nota sobre `email`

Antes, al recargar la página, `decodeAndSetUser` tomaba `email` del token. Ahora el token no lo trae, así que `currentUser.email` queda `''` hasta que se vuelve a llamar a `GET /auth/me` (que sí devuelve `data.email`). Hoy `/auth/me` solo se llama en el login, no al recargar. Afecta a `user-profile.component.html` (`{{ currentUser?.email }}`) y al respaldo `user.name || user.email` del header (el header usa `name`, que sí viene).

Opciones para el frontend: guardar `email` (y `name`) de `/auth/me` en `localStorage` junto a `userRole`/`userDoctorId` y mezclarlos en el constructor de `AuthService`, o llamar a `/auth/me` al recargar.

## Payload real del JWT

Decodificado de un login real del usuario QA `qa_super_clean` (2026-10-01):

```json
{
  "id": "a1000000-0000-4000-8000-000000000007",
  "roleId": "2812c7ac-4829-4880-a3b1-314cf88b4895",
  "name": "qa_super_clean",
  "iat": 1790904552,
  "exp": 1790908152
}
```

Antes (hasta la Fase 3): `{ "id": "...", "user": { "id": "...", "user": { "id", "name", "email", "roleId", "status", "createdAt", ... } }, "iat", "exp" }`.

## Errores

| Situación | Código | `error` |
|---|---|---|
| Login con usuario inexistente, inactivo, con rol inactivo o con contraseña errónea | 401 | `Credenciales inválidas` |
| Login con `password` de menos de 6 caracteres (validación del DTO, sin cambios) | 400 | `La contraseña debe tener al menos 6 caracteres` |
| Refresh con un refresh token que no es el último emitido | 401 | `Refresh token inválido` |
| Refresh de un usuario borrado o desactivado | 401 | `Usuario inactivo o eliminado` |
| `DELETE /roles/:id` con un id inexistente | 404 | `Rol con ID <id> no encontrado` |

## Qué NO cambió

- Rutas y cuerpos de `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` y `POST /auth/logout`. La respuesta del login sigue siendo `{ access_token, refresh_token }`.
- `/auth/me` devuelve lo mismo que en la Fase 2 (`id`, `name`, `email`, `doctorId`, `modules` cifrado).
- Formato de los códigos `APT-AAAA-NNNNN`, `CONS-…`, `REC-…`, `PAC-…`. Ahora salen de una secuencia de PostgreSQL: el número **no se reinicia** cada enero y puede haber saltos (un intento fallido consume un número). El frontend no debe deducir nada del valor.
- `GET /permissions` sigue en la misma ruta y con la misma respuesta (se quitó la declaración duplicada del controlador).
- Duración del access token: 1 h (`JWT_EXPIRES_IN`).

## ¿Hay datos?

Sí. No hubo backfill: el payload nuevo aparece en cuanto el usuario hace login o refresh. Las secuencias se inicializaron con el mayor sufijo existente de cada tabla.

## Checklist de migración del frontend

- [ ] Nada obligatorio para `id`, `name`, `roleId`: `decodeAndSetUser` ya los lee del nivel superior.
- [ ] Decidir cómo recuperar `email` tras recargar (ver nota) o aceptar que el perfil lo muestre vacío hasta el próximo login.
- [ ] Opcional: limpiar los respaldos `payload?.user?.user ?? payload?.user` de `decodeAndSetUser` cuando ya no queden tokens viejos.
- [ ] Opcional: quitar `firstName`/`lastName` del token como fuente (nunca vinieron en el JWT de este backend).
