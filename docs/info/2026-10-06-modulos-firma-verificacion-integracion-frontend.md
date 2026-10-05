# Integración frontend — Menú por permiso `module`, firma/sello del médico y verificación de recetas

- **Base URL**: `http://localhost:8008` (sin prefijo global).
- **Auth**: `Authorization: Bearer <access_token>`, salvo `GET /public/recipes/verify/:code` (público).
- **Envelope de éxito**: `{ "code": <status>, "data": <payload> }`.
- **Envelope de error**: `{ "data": null, "error": "<mensaje>", "statusCode": <status> }` — excepción: el 404 de la
  verificación pública devuelve el envelope de éxito con `data: { "valid": false }` (ver §3).

## Qué cambió en esta versión

| Cambio | Acción del front |
|---|---|
| Nueva acción de sistema `module` ("Ver módulo en el menú") en el catálogo `GET /permissions` | La matriz rol × módulo la muestra como una columna más. Se otorga/revoca igual que las otras (`POST /permissions/assign-to-role` con `{permissionId, submenuId}`) |
| El árbol `menus` de `GET /permissions/me` y de `GET /auth/me` (`modules`, cifrado) ahora solo incluye menús con `<slug>.module` (y los padres de un hijo visible) | Nada si el sidebar ya pinta `menus`. **No** deducir visibilidad desde `permissions` CRUD (`role.consultar` ya no implica ver "Roles") |
| `permissions` (lista plana) incluye ahora códigos `<slug>.module` | Ignorarlos para habilitar botones; son solo de visibilidad |
| `GET /doctors/me` | Perfil del médico autenticado + `hasSignature`, `hasStamp` |
| `POST/DELETE /doctors/me/signature`, `POST/DELETE /doctors/me/stamp` | Pantalla "Mi perfil": subir/quitar firma y sello |
| `POST/DELETE/GET /doctors/:id/signature`, `.../stamp` | Admin (o el propio médico) gestiona/ve las imágenes |
| PDF de receta: firma sobre la línea, sello al lado, QR + código + URL de verificación | Nada (el PDF se regenera solo) |
| `GET /public/recipes/verify/:code` | Página pública `/verificar/:code` |
| Variable `FRONTEND_URL` (default `http://localhost:8007`) | Debe apuntar al origen público del front: el QR abre `${FRONTEND_URL}/verificar/<code>` |

**Qué NO cambió**: los guards siguen exigiendo los permisos CRUD (`patient.consultar`, etc.). Tener `x.module` sin
`x.consultar` muestra el ítem pero la pantalla recibirá 403; quitar `x.module` oculta el ítem pero no bloquea la API.
`GET /doctors/:id` no expone rutas de archivo (las columnas son `select: false`).

## 1. Permiso de visibilidad `<slug>.module`

Fila del catálogo (`GET /permissions`, real):

```json
{"id":"2908f465-a5bd-417d-910b-f253eb03d352","name":"module","displayName":"Ver módulo en el menú","userId":"00000000-0000-0000-0000-000000000000","isActive":true,"createdAt":"2026-10-05T19:41:55.182Z","updatedAt":null,"deletedAt":null,"order":5,"isRequired":false,"controlType":null}
```

Es acción de sistema como `crear/consultar/actualizar/eliminar`: `DELETE /permissions/:id` y
`PATCH /permissions/:id {isActive:false}` → **409**.

Regla del árbol: un menú aparece si el rol tiene `<slug>.module` activo **o** si algún hijo aparece; solo menús con
`es_visible = true` y activos. Un menú nuevo creado por `/menu` no aparece para nadie hasta otorgarle `module`.

### Matriz inicial (migración `MenuModulePermission1790521100000`)

| Menú (slug) | Padre | superusuario | medico | enfermero |
|---|---|:-:|:-:|:-:|
| Inicio (`menu`) | — | ✔ | ✔ | ✔ |
| Centros Médicos (`medical-center`) | — | ✔ | ✔ | ✔ |
| Departamentos (`departments`) | Centros Médicos | ✔ | ✔ | — |
| Doctores (`doctors`) | Departamentos | ✔ | — | — |
| Pacientes (`patient`) | Centros Médicos | ✔ | ✔ | ✔ |
| Citas Médicas (`appointments`) | Centros Médicos | ✔ | ✔ | — |
| Recetas Médicas (`recipe`) | Centros Médicos | ✔ | ✔ | — |
| Historial Médico (`medical-history`) | Centros Médicos | ✔ | ✔ | — |
| Bandeja de análisis IA (`mammography-analysis`) | Centros Médicos | ✔ | ✔ | — |
| Detector IA (`machine-learning`) | Centros Médicos | ✔ | ✔ | — |
| Seguridad (`security`), Usuarios (`user`), Roles (`role`), Permisos (`permission`) | — / Seguridad | ✔ | — | — |
| Bitácora de accesos (`logs`) | — | ✔ | — | — |
| Mi Perfil (`profile`, oculto) | — | ✔ | ✔ | ✔ |
| Resto (ocultos: `auth`, `bullboard`, `redis-session`, `health`, `parameters`, `plan`, `file`, `email`, `user-security`, `common-person`, `crypto`) | — | ✔ | — | — |

`qa_rol_inactivo` y `qa_f2_perm` no reciben nada.

Sidebar resultante (verificado contra la API):

- `cmendoza` (medico): Inicio · Centros Médicos › Departamentos, Pacientes, Citas, Recetas, Historial, Bandeja IA, Detector IA.
- `admin.caracas` (superusuario): además Bitácora de accesos, Seguridad › Usuarios/Roles/Permisos y Departamentos › Doctores.
- `enf.gonzalez` (enfermero): Inicio · Centros Médicos › Pacientes.

Extracto real de `GET /permissions/me` (`cmendoza`):

```json
{"id":"15c14300-6810-459e-bb53-cd1dd4ac62c9","slug":"medical-center","name":"Centros Médicos","url":"#","icon":"fa-building","order":30,
 "submenu":[{"id":"ca788eba-3cf4-4649-9d5e-d1626c124312","slug":"departments","name":"Departamentos","url":"#","icon":"fa-hospital","order":31,"submenu":[]},
            {"id":"fd6a2bac-c8fe-4e91-9839-cd5a06fef078","slug":"patient","name":"Pacientes","url":"#","icon":"fa-user-injured","order":40,"submenu":[]}, "…"]}
```

> Ojo: `medico` conserva `doctors.consultar/actualizar` y `role.consultar` (los usan otras pantallas y guards). Solo
> dejó de ver esos ítems en el menú. Si el front protege rutas con un guard de UI por permiso CRUD, la URL directa
> `/roles` seguirá cargando; eso no cambió.

## 2. Firma y sello del médico

| Método y ruta | Permiso | Alcance | Respuesta |
|---|---|---|---|
| `GET /doctors/me` | autenticado | el propio | Perfil + `hasSignature`, `hasStamp`; 404 si no es médico |
| `POST /doctors/me/signature` · `POST /doctors/me/stamp` | `profile.actualizar` | el propio | 201 `{hasSignature, hasStamp}` |
| `DELETE /doctors/me/signature` · `.../stamp` | `profile.actualizar` | el propio | 200 `{hasSignature, hasStamp}` |
| `POST /doctors/:id/signature` · `.../stamp` | `doctors.actualizar` | ese médico o admin | 201 `{hasSignature, hasStamp}` |
| `DELETE /doctors/:id/signature` · `.../stamp` | `doctors.actualizar` | ese médico o admin | 200 `{hasSignature, hasStamp}` |
| `GET /doctors/:id/signature` · `.../stamp` | `doctors.consultar` | ese médico o admin | `image/png`, `Cache-Control: private, no-store` |

Subida: `multipart/form-data`, campo **`file`**. Se valida por bytes mágicos (PNG, JPEG, WebP; el `Content-Type`
declarado no cuenta), máx. **2 MB**, y se guarda re-codificado a PNG (≤ 1000×1000, sin metadatos) en
`uploads/doctors/<doctorId>/credentials/`. Subir de nuevo reemplaza y borra el archivo anterior.

La imagen es privada: pedirla con `HttpClient` + `responseType: 'blob'` y `URL.createObjectURL`; un `<img src>` directo
no lleva el token.

`GET /doctors/me` (real, `cmendoza`, recortado):

```json
{"code":200,"data":{"id":"c5104979-23ae-45a7-aeb1-199baa3c48f8","commonPersonId":"9ef4a7bd-253f-42c1-b3ec-201fab6be9cb","licenseNumber":"MPPS-48217","isActive":true,"createdAt":"2026-10-04T01:18:20.644Z","updatedAt":"2026-10-04T01:18:20.644Z","deletedAt":null,"commonPerson":{"id":"9ef4a7bd-253f-42c1-b3ec-201fab6be9cb","firstName":"Carolina","…":"…"},"medicalCenters":[{"id":"3e6d7175-75a9-4e8b-b973-f5c41f3a362a","name":"Centro Clínico Ávila","…":"…"}],"specialties":[{"id":"fc6618f2-a886-4396-a269-6cc4792daa59","name":"Mastología","…":"…"}],"imageUrl":null,"hasSignature":true,"hasStamp":true}}
```

`POST /doctors/me/signature` (real): `{"code":201,"data":{"hasSignature":true,"hasStamp":false}}`

### Errores

| Status | `error` | Cuándo |
|---|---|---|
| 400 | `Debe enviar un archivo de imagen en el campo "file".` | Sin archivo |
| 400 | `La imagen debe ser PNG, JPEG o WebP.` | Bytes de otro tipo (p. ej. PDF renombrado) |
| 400 | `La imagen está dañada o no se puede leer.` | Cabecera válida pero imagen corrupta |
| 413 | `El archivo supera el tamaño máximo permitido (2 MB).` | > 2 MB |
| 403 | `Solo el propio médico o un administrador puede gestionar su firma y sello.` | Otro médico sobre `/doctors/:id/...` |
| 403 | `No tienes permisos. Se requiere uno de: …` | Falta el permiso de la tabla |
| 404 | `El usuario no tiene perfil médico.` | `/doctors/me*` con un usuario que no es médico |
| 404 | `El médico no tiene firma registrada.` / `… sello registrada.` | `GET`/`DELETE` sin imagen |

## 3. Verificación pública de recetas

Cada receta tiene `verificationCode` (32 hex, único; las existentes recibieron uno en la migración). El PDF imprime un
QR a `${FRONTEND_URL}/verificar/<code>`, el código, la URL y "Verifique la autenticidad de esta receta escaneando el
código". La página `/verificar/:code` del front llama a:

`GET /public/recipes/verify/:code` — sin token, **10 consultas/min por IP** (luego 429).

Válida (real):

```json
{"code":200,"data":{"valid":true,"recipeNumber":"REC-2026-00008","issuedAt":"2026-05-23T16:08:00.000Z","status":"active","doctor":{"fullName":"Dr(a). Carolina Isabel Mendoza Rivas","license":"MPPS-48217","specialty":"Mastología"},"center":{"name":"Centro Clínico Ávila"},"patientInitials":"N.C.H."}}
```

Desconocida o mal formada (real) — HTTP **404**:

```json
{"code":404,"data":{"valid":false}}
```

Anulada o eliminada — HTTP 200: `{"code":200,"data":{"valid":false,"status":"cancelled"}}` (o `"deleted"`).
`status` en una válida puede ser `active`, `dispensed` o `expired`: es auténtica, el front decide cómo mostrarla.

No se devuelven diagnóstico, ítems, indicaciones, nombre ni documento del paciente. Cada consulta queda en
`auditoria.access_log` con `action = 'recipe_verify'` (filtrable en `GET /audit/access-log?action=recipe_verify`).

| Status | Cuándo |
|---|---|
| 200 `valid:true` | Receta auténtica |
| 200 `valid:false` + `status` | Anulada / eliminada |
| 404 `valid:false` | Código desconocido |
| 429 | Más de 10 consultas por minuto desde la IP |

## Datos en la base

- Todas las recetas tienen código (198/198, únicos). `doctors.signature_path/stamp_path` están vacíos salvo
  `cmendoza`, que quedó con una firma y un sello **sintéticos** (rectángulos de color) usados en la verificación.

## Checklist de migración del front

- [ ] Matriz de permisos: mostrar la columna `module` (viene del catálogo).
- [ ] Sidebar: pintar `menus` tal cual; no mezclar con permisos CRUD.
- [ ] "Mi perfil": `GET /doctors/me` (404 → ocultar la sección) y subida de firma/sello.
- [ ] Vista admin de médico: subir/ver firma y sello por `/doctors/:id/...` con blob.
- [ ] Ruta pública `/verificar/:code` (sin guard de sesión) que llame al endpoint público y maneje 404 y 429.
