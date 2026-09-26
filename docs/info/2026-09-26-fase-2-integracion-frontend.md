# Fase 2 (contratos frontend ↔ backend) — Guía de integración para el frontend

> Fecha: 2026-09-26 · Backend `api-gestion-medica`, rama `dt/modules` (commits `263d5f0` a `1f48a8f`) · Plan: `app-gestion-medica/docs/plans/2026-09-25-plan-mejoras.md` §2 Fase 2 (M-26 a M-37, parte backend).
> Destinatario: quien mantenga `app-gestion-medica` (interceptor de errores, roles, permisos, menú, médicos, horarios, cierre de consulta, perfil y pacientes).
> Todo lo que sigue se verificó contra el código y con `curl`/`fetch` sobre el contenedor reconstruido (41/41 casos, ver la tarea `docs/tasks/2026-09-26-001-fase-2-contratos.md`).

## 1. Datos generales

| Tema | Valor |
|---|---|
| Base URL | `environment.apiUrl` (local `http://localhost:8008`) |
| Autenticación | `Authorization: Bearer <access_token>` o cookie `access_token` (sin cambios) |
| Envoltorio de éxito | `{ "code": <status>, "data": <contenido> }` (sin cambios) |
| Envoltorio de error | `{ "data": null, "error": <mensaje o arreglo de mensajes>, "statusCode": <status> }` (sin cambios) |
| Validación | `ValidationPipe({ transform: true, whitelist: true })`: un campo que el DTO no declara se **descarta en silencio**, no da error |

## 2. Qué cambió en esta versión

| # | Ítem | Cambio | Endpoint | Acción del frontend |
|---|---|---|---|---|
| 1 | M-29 | Sin token o con token inválido → **401** (antes 403 sin token). 403 queda solo para "falta el permiso" | todas las rutas protegidas | Quitar el caso especial de 403 "Token requerido". Refrescar solo con 401; con 403 mostrar "No tiene permiso" sin cerrar sesión |
| 2 | M-29 | Usuario inexistente, sin rol, inactivo o con rol inactivo → **401** (antes 403 en `PermissionsGuard` y en `/admin/queues`) | todas | Igual que el anterior: 401 = sesión inválida |
| 3 | M-27 | Los ids de permisos se validan como **UUID** y ya no se descartan | `POST /permissions/assign`, `DELETE /permissions/revoke`, `POST /permissions/bulk-update`, `POST /permissions/bulk-assign/role`, `POST /permissions/bulk-assign/role/multiple-modules` | Enviar `roleId`, `moduleId`, `permissionId(s)` como UUID string (antes estos endpoints respondían 400 o perdían el `roleId`) |
| 4 | M-27 | **Retirados** `POST /permissions/bulk-assign/user` y `/bulk-assign/user/multiple-modules` (404) | — | No usarlos (el frontend no los usa). Nunca funcionaron y habrían dado el permiso a todo el rol del usuario |
| 5 | M-26 | **No existe `POST /permissions`** (404): las acciones son un catálogo fijo | — | Retirar la pantalla "crear permiso" |
| 6 | M-26 | `PATCH /roles/:id` persiste `isActive` (antes el DTO esperaba `active` y lo ignoraba) | `PATCH /roles/:id`, `POST /roles` | Usar `PATCH` (no `PUT`, que da 404). `description` no se guarda (no hay columna) |
| 7 | M-26 | `PATCH /permissions/:id` persiste `displayName`, `isActive`, `order`, `isRequired`, `controlType`; cambiar `name` → 400 | `PATCH /permissions/:id` | Usar `PATCH` y enviar `displayName` (no `description`/`slug`, que se descartan) |
| 8 | fase 2 | Las acciones del sistema (`crear`, `consultar`, `actualizar`, `eliminar`) no se pueden borrar ni desactivar → **409** | `DELETE /permissions/:id`, `PATCH /permissions/:id` con `isActive:false` | Ocultar "eliminar"/"desactivar" para esas cuatro o mostrar el `error` |
| 9 | M-26 | Los roles `superusuario` y `medico` no se pueden renombrar → 400 | `PATCH /roles/:id` | Mostrar el `error`; se puede seguir cambiando `isActive` |
| 10 | M-28 | Existe el menú `common-person` con sus 4 acciones para `superusuario` | `GET/POST/PATCH/DELETE /common-persons` | Ninguna. Superusuario: 200 (antes 403). Otros roles siguen en 403 hasta que se les asigne |
| 11 | M-32 | `commonPerson.phoneNumber` se valida y se guarda | `PATCH /doctors/:id`, `POST /users`, `PATCH /users/:id`, `POST/PATCH /patient`, `POST/PATCH /common-persons`, `PATCH /auth/me` | Enviar `phoneNumber` (máx. 20). `""` o `null` lo borran |
| 12 | M-32 | `POST /users` y `PATCH /users/:id` validan `commonPerson` anidado (antes pasaba sin validar) | `POST /users`, `PATCH /users/:id` | Los límites de persona (30 caracteres, letra de 1) ahora dan 400 en el alta de usuario |
| 13 | M-33 | `roleId` es opcional **solo si se envía `doctor`**: el backend asigna el rol `medico` por nombre | `POST /users` | Dejar de enviar el UUID fijo `69cf7b3a-…`. Sin `doctor` y sin `roleId` → 400 |
| 14 | M-35 | `medicalHistory.observations` se guarda en `medical_histories.observations` | `PATCH /medical-appointments/:id/finish-consultation` | Seguir enviando `observations` dentro de `medicalHistory` |
| 15 | M-35 | `quantity` del ítem de receta: opcional, entero ≥ 1, por defecto 1 | cierre de consulta, `POST /recipes`, `PATCH /recipes/:id` | Agregar el campo cantidad o no enviarlo (queda 1). `1.5`, `0` o `"2"` → 400 |
| 16 | M-37 | Horarios aceptan `HH:mm` o `HH:mm:ss` (00:00–23:59) y se guardan como `HH:mm:ss` | `POST /doctors/schedules`, `PATCH /doctors/schedules/:blockId` | Se puede reenviar el valor leído (`08:00:00`). `24:00`, `8:00` → 400 |
| 17 | fase 2 | **Nuevo** `GET /auth/profile`: perfil propio con solo sesión (sin `user.consultar`) | `GET /auth/profile` | Usarlo en "Mi perfil" en lugar de `GET /users/:id` |
| 18 | fase 2 | Paciente con correo: `email` en el cuerpo, se guarda en `patients.email` | `POST /patient`, `PATCH /patient/:id`, `POST /medical-appointments` (`newPatientData.email`) | Enviar `email` en la raíz del paciente (no dentro de `commonPerson`) |

## 3. Contratos exactos

### 3.1 Errores de autenticación y permiso (M-29)

| Caso | Status | `error` |
|---|---|---|
| Sin token (ni header ni cookie) | 401 | `Token requerido para esta petición` |
| Token mal formado, firmado con otro secreto o vencido | 401 | `Token inválido o expirado. Por favor, inicie sesión nuevamente.` |
| Sesión cerrada o reemplazada en Redis | 401 | `Sesión expirada o cerrada` |
| Usuario borrado/desactivado o rol inactivo | 401 | `Sesión inválida: usuario inactivo o eliminado` (o `El usuario o su rol están inactivos`) |
| Usuario sin rol | 401 | `Sesión inválida: usuario sin rol asignado` |
| Falta el permiso | 403 | `No tienes permisos. Se requiere uno de: <modulo.accion>` |
| Recurso ajeno (p. ej. paciente de otro médico) | 403 | sin cambios (`No tiene acceso a este paciente.`, etc.) |

Respuesta real (`curl -i http://localhost:8008/users`):

```json
{"data":null,"error":"Token requerido para esta petición","statusCode":401}
```

### 3.2 Roles, permisos y menú (M-26, M-27)

| Método y ruta | Permiso | Cuerpo | Respuesta |
|---|---|---|---|
| `PATCH /roles/:id` | `role.actualizar` | `{ "name"?: string ≤255, "isActive"?: boolean }` | `data`: el rol (`id`, `name`, `userId`, `isActive`, fechas, `permissionMenus`) |
| `POST /roles` | `role.crear` | `{ "name": string, "isActive"?: boolean }` | `data`: el rol creado |
| `PATCH /permissions/:id` | `permission.actualizar` | `{ "name"?: igual al actual, "displayName"?: string, "isActive"?: boolean, "order"?: int ≥0, "isRequired"?: boolean, "controlType"?: string }` | `data`: el permiso (`id`, `name`, `displayName`, `isActive`, `order`, `isRequired`, `controlType`, fechas) |
| `DELETE /permissions/:id` | `permission.eliminar` | — | 200 para acciones propias; **409** para `crear`/`consultar`/`actualizar`/`eliminar` |
| `PATCH /menu/:id` | `menu.actualizar` | `{ "name"?, "slug"?, "parentId"?: uuid\|null, "url"?, "icon"?, "order"?: number, "isTitle"?, "isActive"?, "can"? }` | `data`: el menú con `parent` y `submenu` |
| `POST /permissions/assign-to-role` | `permission.crear` | `{ "roleId": uuid, "assignments": [{ "permissionId": uuid, "submenuId": uuid }] }` (reemplaza todo) | `data`: `{ "created", "skipped", "deactivated" }` — **sin cambios**, es el que usa la pantalla de permisos del rol |
| `POST /permissions/assign` | `permission.crear` | `{ "roleId": uuid, "menuSlug": string, "action": string, "permissionId"?: uuid }` | `data`: la fila de `permisos_menus` |
| `DELETE /permissions/revoke` | `permission.eliminar` | `{ "roleId": uuid, "menuSlug": string, "action": string }` | `data`: `{ "success": true\|false }` (`false` si no había asignación viva) |
| `POST /permissions/bulk-update` | `permission.actualizar` | `{ "roleId": uuid, "permissions": [{ "module": slug, "action": string, "enabled": boolean }] }` | `data`: `{ "success": true }` |
| `POST /permissions/bulk-assign/role` | `permission.crear` | `{ "roleId": uuid, "moduleId": uuid, "permissionIds": [uuid] }` | `data`: `{ "success", "assignedCount", "errors" }` |
| `POST /permissions/bulk-assign/role/multiple-modules` | `permission.crear` | `{ "roleId": uuid, "permissions": [{ "moduleId": uuid, "permissionId": uuid, "enabled"?: boolean }] }` | `data`: `{ "success", "assignedCount", "message", "errors"? }` |

Nota: `PUT` no existe en ninguna de estas rutas (404). El `ApiService` del frontend necesita `patch`.

### 3.3 Alta de médico (M-33) — `POST /users`

```json
{
  "name": "nuevo.medico",
  "email": "nuevo.medico@example.com",
  "password": "secreto1",
  "commonPerson": { "firstName": "Nuevo", "lastName": "Médico", "letter": "V", "documentNumber": "12345678", "phoneNumber": "04141234567" },
  "doctor": { "specialtyIds": ["<uuid>"], "medicalCenterIds": ["<uuid>"], "licenseNumber": "MPPS-123" }
}
```

Respuesta 201: `data` = usuario sin `password` (`id`, `name`, `email`, `roleId`, `status`, `firstLogin`, `commonPerson`, …) más `doctor: { "id": "<uuid>" }`. `roleId` queda en el del rol `medico` de la base.

| Caso | Status | `error` |
|---|---|---|
| Sin `roleId` y sin `doctor` | 400 | `El rol es obligatorio (roleId).` |
| Sin `roleId`, con `doctor`, y no existe un rol `medico` activo | 422 | `No existe un rol 'medico' activo para asignar al médico. Créelo o envíe roleId.` |
| `roleId` enviado | — | se respeta (sigue funcionando el formulario de usuarios) |

### 3.4 Cierre de consulta (M-35) — `PATCH /medical-appointments/:id/finish-consultation`

```json
{
  "observations": "Notas de la cita",
  "medicalHistory": { "consultationDate": "2026-09-26T10:00:00.000Z", "reasonForVisit": "Control", "observations": "Notas del médico" },
  "recipe": { "items": [
    { "medicationName": "Ibuprofeno", "dosage": "400mg", "frequency": "8h", "quantity": 2 },
    { "medicationName": "Paracetamol", "dosage": "500mg", "frequency": "12h" }
  ] }
}
```

`observations` de la raíz sigue yendo a la cita; `medicalHistory.observations` va al historial. El segundo ítem queda con `quantity = 1`.

### 3.5 Horarios (M-37)

`PATCH /doctors/schedules/:blockId` con `{ "startTime": "08:00:00", "endTime": "12:00:00" }` → 200. Las respuestas siguen devolviendo `HH:MM:SS`. Error: `startTime debe tener formato HH:mm o HH:mm:ss (00:00 a 23:59)`.

### 3.6 Perfil propio — `GET /auth/profile` (nuevo)

Solo exige sesión válida. Respuesta real (usuario `enfermero`, sin `user.consultar`):

```json
{"code":200,"data":{"id":"a1000000-0000-4000-8000-000000000002","name":"qa_enfermero","email":"qa.enfermero@example.com","emailVerifiedAt":"2026-09-26T02:22:34.830Z","status":true,"createdAt":null,"updatedAt":null,"deletedAt":null,"roleId":"c6dcc63d-bc87-46db-b60b-5c1d3221b8f4","firstLogin":true,"commonPerson":{"id":"a1000000-0000-4000-8000-000000000001","letter":"V","documentNumber":"99000001","firstName":"QA","middleName":null,"lastName":"Enfermero","secondLastName":null,"phoneNumber":"04140000001","isActive":true,"createdAt":"2026-09-26T02:22:34.830Z","updatedAt":null,"deletedAt":null,"photoUrl":null},"role":{"id":"c6dcc63d-bc87-46db-b60b-5c1d3221b8f4","name":"enfermero"},"imageUrl":null}}
```

Es la misma forma que `GET /users/:id`, sin `password` y con `role` reducido a `{ id, name }`. Un usuario de `seguridad.users` recibe `commonPerson: null` e `imageUrl: null`. Guardar sigue siendo `PATCH /auth/me`.

### 3.7 Correo del paciente

`POST /patient` / `PATCH /patient/:id`: `{ "commonPerson": { … }, "email": "paciente@example.com", … }`. En `POST /medical-appointments` por documento: `newPatientData: { "commonPerson": { … }, "email": "…" }`. Se devuelve como `email` en el detalle del paciente. Correo inválido → 400 `El correo del paciente no es válido`; `""` lo borra.

## 4. Qué NO cambió

- `GET /auth/me`: misma forma. `medicalCenters` (dentro de `modules`, cifrado) sigue saliendo **solo del médico vinculado**. Un usuario que no es médico (p. ej. `enfermero`, o `superusuario` sin doctor) recibe `[]`. **No hay relación usuario ↔ centro en el modelo** (solo `medical_centers_doctors`); ver la tarea, "Brecha de modelo". El frontend tiene que definir la salida para esos usuarios (M-38).
- `POST /permissions/assign-to-role` y `POST /permissions/roles/:roleId/assign-all`: sin cambios.
- `GET /permissions` sigue devolviendo el catálogo (4 acciones hoy).
- Las respuestas de horarios siguen en `HH:MM:SS`.
- `observations` de la raíz del cierre de consulta sigue guardándose en la cita.
- Los datos existentes pasan las validaciones nuevas: los 12 teléfonos guardados (8–13 dígitos, uno con `+`), las 4 cantidades de receta (1–10) y los 18 horarios.
- `patients.email` es nuevo: **todos los pacientes existentes lo tienen en `null`** (no hay backfill posible, el dato nunca se guardó).

## 5. Errores nuevos (copiados del código)

| Status | `error` | Cuándo |
|---|---|---|
| 400 | `roleId debe ser un UUID válido` (también `moduleId`, `permissionId`, `Cada permissionId…`) | ids de permisos no UUID |
| 400 | `El nombre de la acción no se puede cambiar: los permisos de cada módulo se verifican por ese nombre.` | `PATCH /permissions/:id` con otro `name` |
| 409 | `La acción '<nombre>' es del sistema y no se puede eliminar: la usan los permisos de todos los módulos.` (o `desactivar`) | borrar o desactivar una de las 4 acciones |
| 400 | `El rol '<nombre>' es del sistema y no se puede renombrar.` | renombrar `superusuario` o `medico` |
| 400 | `El rol es obligatorio (roleId).` | `POST /users` sin `roleId` ni `doctor` |
| 422 | `No existe un rol 'medico' activo para asignar al médico. Créelo o envíe roleId.` | alta de médico sin el rol en la base |
| 400 | `El teléfono solo admite dígitos, espacios, guiones y un + inicial (mínimo 7 caracteres)` / `El teléfono no puede superar los 20 caracteres` | `phoneNumber` inválido |
| 400 | `La cantidad debe ser un número entero` / `La cantidad mínima es 1` | `quantity` inválida |
| 400 | `startTime debe tener formato HH:mm o HH:mm:ss (00:00 a 23:59)` (ídem `endTime`) | hora inválida |
| 400 | `El correo del paciente no es válido` | `email` del paciente inválido |
| 404 | `Usuario no encontrado` | `GET /auth/profile` de un usuario borrado |

## 6. Checklist de migración del frontend

- [ ] `errorInterceptor`: refrescar solo con 401; 403 → mensaje de permiso, sin logout; quitar el caso "Token requerido" en 403.
- [ ] `ApiService.patch` y usarlo en `RoleService.update`, `PermissionService.update`, `MenuService.update`.
- [ ] Retirar "crear permiso"; en la lista, no ofrecer eliminar/desactivar `crear`/`consultar`/`actualizar`/`eliminar`.
- [ ] Formulario de permiso: enviar `displayName` e `isActive`; no enviar un `name` distinto.
- [ ] Formulario de rol: `isActive` (ya lo envía); `description` no se guarda.
- [ ] `doctor-form`: quitar `doctorRoleId` y no enviar `roleId` (`rg 69cf7b3a src` sin resultados).
- [ ] Consulta: campo cantidad (entero ≥ 1) u omitirlo.
- [ ] "Mi perfil": leer con `GET /auth/profile`.
- [ ] Alta de paciente/cita: enviar `email` en la raíz del paciente.
- [ ] Usuarios sin centros (no médicos): definir la salida (el backend no tiene relación usuario ↔ centro).
