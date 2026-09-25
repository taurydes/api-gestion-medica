# Fase 0 (seguridad) — Guía de integración para el frontend

> Fecha: 2026-09-25 · Backend `api-gestion-medica`, rama `dt/modules` (cambios sin commit) · Plan: `app-gestion-medica/docs/plans/2026-09-25-plan-mejoras.md` (M-02 a M-11 y M-31).
> Destinatario: quien implemente F4 (`feat(profile)`) y la adaptación de imágenes en `app-gestion-medica`.

## 1. Datos generales

| Tema | Valor |
|---|---|
| Base URL | `environment.apiUrl` (local `http://localhost:8008`; en desarrollo del backend se probó en `:8020`) |
| Autenticación | `Authorization: Bearer <access_token>`, igual que antes. Las rutas nuevas **no** usan cookie |
| Envoltorio de éxito | `{ "code": <status>, "data": <contenido> }` (sin cambios) |
| Envoltorio de error | `{ "data": null, "error": <mensaje o arreglo de mensajes>, "statusCode": <status> }` (sin cambios). Los errores de validación traen `error` como **arreglo** |

## 2. Qué cambió en esta versión

| # | Cambio | Endpoint | Acción del frontend |
|---|---|---|---|
| 1 | **Nuevo:** cambiar la contraseña propia verificando la actual | `PATCH /auth/change-password` | `user-profile.component.ts` → `changePassword()` debe llamar a este endpoint y enviar `currentPassword` + `newPassword`. Agregar el campo "Contraseña actual" al formulario |
| 2 | **Nuevo:** actualizar el perfil propio sin `user.actualizar` | `PATCH /auth/me` | `saveProfile()` debe usar este endpoint en lugar de `PATCH /users/:id`. Solo acepta `email` y `commonPerson` |
| 3 | `PATCH /users/:id` **rechaza `password`** con 400 | `PATCH /users/:id` | `user-form.component.ts` (modo edición): quitar el campo contraseña o no enviarlo. No hay reemplazo para que un admin fije la contraseña de otro usuario (pendiente) |
| 4 | `PATCH /users/:id`: cambiar `roleId` exige `role.actualizar`; cambiar `status` exige `user.eliminar` | `PATCH /users/:id` | Reenviar el mismo `roleId`/`status` sigue funcionando. Si el usuario no es admin, ocultar o deshabilitar esos campos para evitar el 403 |
| 5 | `/users-security/*` exige `user-security.*` (antes `user.*`) | `/users-security` | Hoy el frontend no lo consume. Solo `superusuario` tiene ese permiso |
| 6 | **`/uploads/*` ya no se sirve** (404) | `/uploads/...` | Toda imagen debe cargarse desde `/files/...` con `Authorization`, es decir con el pipe `secureImage` o `HttpClient`. Ver §4 |
| 7 | Las URLs que devuelven las subidas ahora apuntan a endpoints con guard | `POST /files/profile-photo`, `/files/common-person-photo`, `/files/medical-center-photo`, `/files/doctor-photo`, `GET /files/appointment-files?appointmentId=` | Sin cambio si ya se muestran con `secureImage`. Ver §4 para los `<img [src]>` directos |
| 8 | DICOM: `images[].url` apunta a `GET /files/dicom-conversions/:sessionId/:filename` (guard `file.consultar`) | `POST /files/dicom-convert` | `cancer-detector` y `consultation` usan esa URL en `<img [src]>` directo: pasarla por `secureImage`. `urlToFile()` ya usa `HttpClient`, sigue funcionando |
| 9 | `POST /files/dicom-convert` exige `file.crear` (antes `file.consultar`) | idem | Sin impacto con los roles actuales (`medico` y `superusuario` tienen `file.crear`) |
| 10 | `/specialties` exige `parameters.*` (antes sin permiso) | `GET/POST/PATCH/DELETE /specialties` | Sin impacto para `medico` y `superusuario`. Un rol sin `parameters.consultar` recibe 403 al listar especialidades |
| 11 | `POST /recipes` exige `recipe.crear` (antes `recipe.consultar`) | `POST /recipes` | Sin impacto con los roles actuales |
| 12 | Los 4 endpoints de `/dashboard` exigen `appointments.consultar` | `/dashboard/*` | `enfermero` recibe 403 en el inicio. Con el `errorInterceptor` actual un 403 dispara refresh/logout (M-30): conviene tolerar el 403 en `home.page` o publicar M-30 junto con esto |
| 13 | Dashboard y mamografías acotados al médico; admin se decide por el permiso `security.consultar` | `/dashboard/*`, `/mammography-analyses/*` | Un médico ve solo sus citas y análisis. Un análisis ajeno → 403 `No tiene acceso a este análisis.` |
| 14 | `GET /patient/:id` y `GET /recipes/medical-history/:id` filtran por médico | idem | Médico sin citas con ese paciente → 403 `No tiene acceso a este paciente.` |
| 15 | Login y refresh rechazan usuarios borrados o desactivados; al borrar o desactivar un usuario se cierra su sesión | `POST /auth/login`, `POST /auth/refresh` | Sin cambio de contrato: siguen respondiendo 401 |
| 16 | Bull Board y la vista de logs exigen JWT + sesión + permiso leído de la BD | `/admin/queues`, `/logs/ui/view`, `/logs/ui/api` | No los usa la SPA. `/logs/ui/view` ya no acepta `?token=` |

## 3. Contratos nuevos

### 3.1 `PATCH /auth/change-password`

- Auth: JWT + sesión. **Sin permiso de módulo.** Aplica a `users` y a `seguridad.users`.
- Body (`src/user/dto/change-password.dto.ts`):

```json
{ "currentPassword": "claveActual1", "newPassword": "claveNueva1" }
```

- 200:

```json
{ "code": 200, "data": { "message": "Contraseña actualizada correctamente" } }
```

- La sesión actual **sigue válida** (el modelo de sesión es único por usuario en Redis; no hay otras sesiones que cerrar).

| Status | `error` | Cuándo |
|---|---|---|
| 400 | `"La contraseña actual es incorrecta"` | bcrypt no coincide. Es 400 y no 401 a propósito: un 401 dispararía el refresh del `errorInterceptor` |
| 400 | `"La nueva contraseña debe ser distinta de la actual"` | `newPassword === currentPassword` |
| 400 | `["La nueva contraseña debe tener al menos 6 caracteres"]` | validación (arreglo) |
| 400 | `["La contraseña actual es obligatoria"]` | falta `currentPassword` |
| 404 | `"Usuario no encontrado"` | el id del JWT no existe o está borrado |
| 401/403 | mensajes del guard | sin token o token inválido (403 sin token hasta M-29) |

### 3.2 `PATCH /auth/me`

- Auth: JWT + sesión. **Sin permiso de módulo.** Solo usuarios de `public.users` (los de `seguridad.users` no tienen perfil de persona).
- Body (`src/user/dto/update-profile.dto.ts`). Todo es opcional; los campos no listados se descartan (`whitelist`):

```json
{
  "email": "juan@example.com",
  "commonPerson": {
    "firstName": "Juan",
    "middleName": "Carlos",
    "lastName": "Pérez",
    "secondLastName": "Gómez",
    "phoneNumber": "04141234567",
    "photoUrl": "http://localhost:8008/files/profile-photos/<userId>/<archivo>.webp"
  }
}
```

- `roleId`, `status` y `password` **se ignoran** aunque se envíen.
- 200: el usuario actualizado **sin** `password` ni relaciones (la misma forma que devolvía `PATCH /users/:id`):

```json
{
  "code": 200,
  "data": {
    "id": "…", "name": "juan", "email": "juan@example.com",
    "emailVerifiedAt": "…", "status": true, "createdAt": "…", "updatedAt": "…",
    "deletedAt": null, "roleId": "…", "firstLogin": false
  }
}
```

| Status | `error` | Cuándo |
|---|---|---|
| 400 | `["Debe ser un correo electrónico válido"]`, `["El primer nombre no puede superar los 30 caracteres"]`, `["El teléfono no puede superar los 20 caracteres"]` | validación |
| 400 | `"Error al actualizar el usuario: …"` | email duplicado (mensaje crudo de PostgreSQL; M-61) |
| 404 | `"Usuario con ID … no encontrado."` | usuario de sistema o id inexistente (**antes esta rama respondía 400**) |

### 3.3 `PATCH /users/:id` (administración) — qué cambió

| Envío | Resultado |
|---|---|
| `{"password": "x"}` | 400 `["La contraseña no se puede cambiar por este endpoint. Use PATCH /auth/change-password"]` |
| `roleId` distinto del actual sin `role.actualizar` | 403 `"No tiene permiso para cambiar el rol del usuario."` y no se escribe nada |
| `status` distinto del actual sin `user.eliminar` | 403 `"No tiene permiso para cambiar el estado del usuario."` |
| `status: false` con permiso | 200 y la sesión del usuario se cierra |
| mismo `roleId`/`status` que ya tiene | 200 (el formulario de edición actual sigue funcionando) |
| usuario inexistente | 404 (antes 400) |

Hoy solo `superusuario` tiene `role.actualizar` y `user.eliminar`.

### 3.4 `GET /files/dicom-conversions/:sessionId/:filename`

- Permiso `file.consultar`. Devuelve `image/jpeg`. `sessionId` debe ser UUID y `filename` un nombre sin rutas; si no, 400 `"sessionId debe ser un UUID válido."` / `"El nombre de archivo no es válido."`.
- Respuesta de `POST /files/dicom-convert` (sin cambios de forma; solo cambia `url`):

```json
{ "code": 201, "data": { "sessionId": "…", "totalFrames": 1, "images": [
  { "index": 0, "width": 3328, "height": 4084, "mimeType": "image/jpeg",
    "relativePath": "dicom-conversions/<sessionId>/frame-1.jpg",
    "url": "http://localhost:8008/files/dicom-conversions/<sessionId>/frame-1.jpg" } ] } }
```

## 4. Imágenes: qué deja de cargar si no se adapta

`rg "/uploads" app-gestion-medica/src` no da resultados: el frontend no arma URLs de `/uploads`, pero **muestra URLs que devuelve el backend**. Tras M-06, esas URLs apuntan a `/files/...` y exigen `Authorization`. Un `<img [src]>` directo no manda el header y queda roto:

| Componente | Línea | Qué muestra | Cambio necesario |
|---|---|---|---|
| `modules/machine-learning/pages/cancer-detector/cancer-detector.component.html` | 163 | miniaturas de frames DICOM (`img.url`) | `[src]="(img.url \| secureImage \| async)"` |
| idem | 201 | `previewUrl()` cuando el origen es DICOM (`selectDicomImage` hace `previewUrl.set(img.url)`) | pasar por `secureImage`, o usar `URL.createObjectURL` del `File` que ya descarga `urlToFile` |
| `modules/appointments/pages/consultation/consultation.component.ts` | 582 (`appendMlImage(jpgFile, img.url)`) → `consultation.component.html:541` `[src]="img.preview"` | preview de frames DICOM | no pasar `img.url` como preview: dejar que `FileReader` lea el `jpgFile` (rama sin `presetPreview`) |
| `modules/users/pages/user-list/user-list.component.html` | 119-120 | `user.commonPerson.photoUrl` en `<img [src]>` directo | usar `secureImage`. Hoy 0 filas de `persona_comun.photo_url` tienen valor, pero las subidas nuevas lo llenarán con una URL `/files/...` |

Ya funcionan sin cambios (usan `secureImage`, Anexo B del plan): encabezado, perfil, listas y detalle de pacientes, usuarios, médicos, centros, citas y consulta.

**Dato en BD:** `persona_comun.photo_url` 0 filas con valor; `medical_centers.image_url` 1 fila y ya es `/files/medical-center-images/…`. Ninguna fila guarda `/uploads/…`: no hace falta migrar URLs.

## 5. Qué NO cambió

- `GET /auth/me` (lectura): misma respuesta y mismo cifrado de `modules`.
- `POST /auth/login`, `/auth/refresh`, `/auth/logout`: mismo contrato; solo se rechazan usuarios borrados o desactivados.
- Sin token sigue respondiendo **403** `"Token requerido para esta petición"` (el 401 llega con M-29). Excepción: `/admin/queues` ya responde 401.
- El permiso para ver o subir fotos sigue siendo `file.consultar` / `file.crear`.
- `GET /users/:id` sigue exigiendo `user.consultar`: el perfil lo sigue usando para leer los datos de la persona.
- `PERMISSIONS_SECRET` y el cifrado de `modules` no cambiaron.

## 6. Checklist de migración (frontend)

- [ ] `user-profile`: `changePassword()` → `PATCH /auth/change-password` con `currentPassword`; campo nuevo en el formulario; mostrar `error` del 400.
- [ ] `user-profile`: `saveProfile()` → `PATCH /auth/me` (mismo body que hoy, sin `password`).
- [ ] `user-form` (edición): no enviar `password`; ocultar `roleId`/`status` a quien no sea admin.
- [ ] `cancer-detector.component.html:163` y `:201`: imágenes DICOM vía `secureImage`.
- [ ] `consultation.component.ts:582`: no usar `img.url` como preview directo.
- [ ] `user-list.component.html:119-120`: `photoUrl` vía `secureImage`.
- [ ] `home.page`: tolerar 403 de `/dashboard/*` para roles sin `appointments.consultar` (o salir con M-30).
- [ ] Probar con `medico`: perfil sin `user.actualizar`, detección DICOM, bandeja de mamografías solo con sus análisis.
