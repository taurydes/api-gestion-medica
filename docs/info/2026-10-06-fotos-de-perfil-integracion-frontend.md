# Integración frontend — Foto de usuario y foto de médico sincronizables

- **Base URL**: `http://localhost:8008` (sin prefijo global).
- **Auth**: `Authorization: Bearer <access_token>`.
- **Envelope de éxito**: `{ "code": <status>, "data": <payload> }`.
- **Envelope de error**: `{ "data": null, "error": "<mensaje>", "statusCode": <status> }`.

## Modelo (lo que hay que saber antes de integrar)

Usuario y médico comparten la misma `persona_comun` (`users.common_person_id` = `doctors.common_person_id`), pero
las **fotos son dos registros distintos**:

| Foto | Dónde vive | Cómo se lee |
|---|---|---|
| Foto de **usuario** | `persona_comun.photo_url` (URL `/files/profile-photos/:ownerId/:file`); respaldo legado: última fila activa de `common_person_images` **solo si la persona nunca fue paciente** (§5) | `imageUrl` de `GET /auth/profile` y `GET /users/:id` |
| Foto de **médico** | Fila activa de `doctor_images` (archivo en `doctors/:doctorId/`) | `imageUrl` de `GET /doctors/:id` y `GET /doctors`; `doctor.photoUrl` en citas |

Por eso subir una no cambia la otra. Esta versión agrega un flag para fijar las dos en **una sola petición**.

## Qué cambió en esta versión

| Cambio | Acción del front |
|---|---|
| `POST /files/profile-photo` acepta `alsoUseForDoctor=true` (multipart) | Si el usuario es médico y acepta, enviar el flag. La respuesta trae `doctorImageUrl` |
| `POST /files/doctor-photo` acepta `alsoUseForUser=true` (multipart) | Desde "Mi perfil médico", si acepta, enviar el flag. La respuesta trae `userPhotoUrl`, **ya persistida** en la persona |
| Nuevo `DELETE /files/profile-photo?alsoUseForDoctor=true` | "Quitar foto" en `/profile`; vacía `photoUrl` del usuario autenticado (y desactiva la foto de médico con el flag) |
| Nuevo `DELETE /files/doctor-photo/:doctorId?alsoUseForUser=true` | "Quitar foto" en el formulario del médico |
| Fotos de perfil y de médico validan los *magic bytes* | Un archivo cuyo contenido no es el tipo declarado → **415** |
| Más de 5 MB en esas dos subidas → **413** con mensaje en español (antes 413 con "File too large") | Validar 5 MB en el cliente igual que antes |
| `imageUrl` del usuario ya no cae a `common_person_images` cuando la persona es (o fue) paciente | Nada; quitar la foto de usuario ya no deja ver la foto de paciente |
| Editar un usuario (admin) debe subir con `POST /files/profile-photo` + `ownerId` y guardar `commonPerson.photoUrl` en `PATCH /users/:id` | Dejar de usar `POST /files/common-person-image` para usuarios: esa tabla es de pacientes |
| `doctorId` de `POST /files/doctor-photo` debe ser UUID | Sin cambio si ya se envía el id real (antes un valor inválido daba 400 de otra forma) |

**Qué NO cambió**:

- `POST /files/profile-photo` **sigue sin persistir** la foto de usuario: devuelve `url` y el front la guarda con
  `PATCH /auth/me { "commonPerson": { "photoUrl": url } }` (o en el formulario de usuario, para el admin). Solo la
  copia en el médico (`alsoUseForDoctor`) se persiste en el mismo request.
- Sin flag, ambos endpoints se comportan como antes: solo tocan su propia foto.
- Permisos: `POST/DELETE /files/profile-photo` solo exigen sesión (foto propia); `ownerId` ajeno exige admin.
  `POST/DELETE /files/doctor-photo` exigen `file.crear` y ser el propio médico o admin (MJ-43).
- `GET /files/profile-photos/:ownerId/:file` sigue sirviendo solo la foto propia o a un admin.

## 1. Subir foto de usuario (con copia opcional al médico)

`POST /files/profile-photo` — `multipart/form-data`

| Campo | Tipo | Notas |
|---|---|---|
| `file` | binario | PNG, JPEG, JPG o WebP; máx. 5 MB; se guarda como WebP |
| `ownerId` | uuid, opcional | Omitido = el usuario autenticado. Ajeno → requiere admin |
| `alsoUseForDoctor` | `"true"`, opcional | También como foto de médico del dueño (si es médico) |

Respuesta con flag (forma real de `ProfilePhotoSyncService.uploadUserPhoto`):

```json
{
  "code": 201,
  "data": {
    "url": "http://localhost:8008/files/profile-photos/00709eb2-63a2-4168-ad25-2eec990476e8/1791302011756-4xtcrp.webp",
    "doctorImageUrl": "http://localhost:8008/files/doctor-images/74523f95-e2a3-498d-8c67-2f98e73beebc"
  }
}
```

- Sin flag: `data` es solo `{ "url": "..." }`.
- Con flag y el dueño **no** es médico: `doctorImageUrl: null` (no es error).

## 2. Subir foto de médico (con copia opcional al usuario)

`POST /files/doctor-photo` — `multipart/form-data`: `file`, `doctorId` (uuid), `alsoUseForUser` (`"true"`, opcional).

```json
{
  "code": 201,
  "data": {
    "url": "http://localhost:8008/files/doctor-images/74523f95-e2a3-498d-8c67-2f98e73beebc",
    "image": { "id": "74523f95-e2a3-498d-8c67-2f98e73beebc", "doctorId": "c5104979-23ae-45a7-aeb1-199baa3c48f8", "mimeType": "image/webp", "isActive": true },
    "userPhotoUrl": "http://localhost:8008/files/profile-photos/00709eb2-63a2-4168-ad25-2eec990476e8/1791302011756-4xtcrp.webp"
  }
}
```

(`image` trae además `uploadedBy`, `originalName`, `storedName`, `fileSize`, `filePath`, fechas; no usarlos.)

- `userPhotoUrl` solo aparece con el flag; `null` si el médico no tiene cuenta de usuario.
- La foto de usuario ya quedó guardada: **no** hace falta `PATCH /auth/me`. Actualizar el avatar del encabezado con
  `userPhotoUrl`.

## 3. Quitar fotos

| Request | Efecto | Respuesta `data` |
|---|---|---|
| `DELETE /files/profile-photo` | `photoUrl = null` del usuario autenticado | `{ "userPhotoRemoved": true, "doctorPhotoRemoved": false }` |
| `DELETE /files/profile-photo?alsoUseForDoctor=true` | Lo anterior + desactiva su foto de médico | `{ "userPhotoRemoved": true, "doctorPhotoRemoved": true }` (false si no es médico) |
| `DELETE /files/doctor-photo/:doctorId` | Desactiva la foto activa del médico | `{ "userPhotoRemoved": false, "doctorPhotoRemoved": true }` |
| `DELETE /files/doctor-photo/:doctorId?alsoUseForUser=true` | Lo anterior + `photoUrl = null` del usuario del médico | `{ "userPhotoRemoved": true, "doctorPhotoRemoved": true }` |

Después de quitar la foto de usuario conviene releer `GET /auth/profile`; con la regla de §5 `imageUrl` queda en
`null` (la baja también retira las fotos legado de usuario).

## 4. Errores

| Status | Mensaje | Cuándo |
|---|---|---|
| 400 | `Debe enviar un archivo de imagen.` | Sin `file` |
| 400 | `Tipo de archivo no permitido: <mime>. Solo se aceptan PNG, JPEG, JPG o WEBP.` | MIME declarado no admitido |
| 400 | validación de UUID | `doctorId` no es UUID |
| 403 | `No puede cambiar la foto de otra persona.` | `ownerId` ajeno sin admin; médico ajeno; o el flag apunta a la cuenta de otra persona |
| 413 | `El archivo supera el tamaño máximo permitido (5 MB).` | Más de 5 MB |
| 415 | `El contenido del archivo no corresponde al tipo declarado (<mime>).` | *Magic bytes* distintos del MIME |

Los chequeos de permiso corren **antes** de escribir: un 403 no deja archivos ni filas.

## 5. Datos y límites conocidos

- Datos reales: la foto de usuario de `cmendoza` que se veía como "cuadrado azul" era una imagen 64×64 de color
  sólido azul (`31,119,203`) subida en pruebas el 2026-10-04, no un fallo del avatar. Al verificar este cambio se
  reemplazó por una 32×32 verde (con `alsoUseForUser`), así que hoy ambas fotos de `cmendoza` coinciden.
- Foto efectiva de usuario (`UserService.getUserImageUrl`): `photoUrl`; si es null, la última fila activa de
  `common_person_images` **solo si la persona nunca fue paciente** (también pacientes dados de baja). Esa tabla no tiene
  tipo y es la de fotos de paciente: para quien no es paciente sus filas solo pudieron venir del formulario de edición
  de usuario anterior a este cambio (fotos legado de usuario). Para un paciente nunca se usa como foto de usuario.
- Quitar la foto de usuario (`DELETE /files/profile-photo`, o `alsoUseForUser` al quitar la del médico) vacía
  `photoUrl` y, si la persona no es paciente, desactiva esas filas legado: no aparece ninguna imagen anterior. La foto
  de paciente nunca se toca.
- Regla en `src/common-person/legacy-user-photo.ts`; pruebas en `src/user/profile.service.spec.ts` y
  `src/files/profile-photo-sync.spec.ts`.
- Las cachés de médico, receta, historia y citas se invalidan al cambiar la foto de médico (antes la subida sola no
  las invalidaba y el detalle cacheado mostraba la foto anterior hasta otro guardado).

## Checklist de migración del front

- [ ] `/profile`: subir/reemplazar/quitar foto; si el usuario es médico, preguntar y enviar `alsoUseForDoctor`.
- [ ] Formulario del médico (propio): preguntar y enviar `alsoUseForUser`; usar `userPhotoUrl` para el encabezado.
- [ ] Tras quitar la foto de usuario, releer `GET /auth/profile`.
- [ ] Manejar 413 y 415 con el mensaje del backend.
