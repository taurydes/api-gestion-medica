# Bloque de mejoras (MJ restantes) — integración frontend

- **Base URL:** `http://localhost:8008` (contenedor `medos-backend`)
- **Auth:** `Authorization: Bearer <access_token>` de `POST /auth/login`
- **Envelope OK:** `{ "code": 200, "data": … }` (listas paginadas: `data` es el arreglo y `total`/`page`/`limit` van al lado)
- **Envelope de error:** `{ "data": null, "error": "<mensaje>" | ["<mensaje>", …], "statusCode": <código> }`

Commits de `api-gestion-medica` (rama `dt/modules`): `a8f71e7` (MJ-24 + cupo diario), `e03fa2e` (MJ-08/09),
`6529edc` (MJ-07), `c712418` (MJ-03/05/11/46), `87efbb3` (MJ-01/06), `84d7605` (MJ-31/41/50), `b21c63d`
(MJ-04/47), `f845961` (MJ-10), `2aa8053` (MJ-12/13/15/17), `6560034` (MJ-14), `73c7b6f` (MJ-02/20/21/22),
`f69dd5b` (MJ-23/48), `05dfa51` (MJ-33/34/37/44), `5b70052` (MJ-36), `f72f485` (MJ-38/45), `8261993`
(MJ-43/46), `575b4de` (MJ-42), `bae8c4a` (MJ-49), `50bed73` (MJ-39), `6ef7922` (mensaje único sin centro),
`738186d` (foto del alta de usuario). Detector (`detector-cancer-de-mama`, `dt/modules`): `564458b` (MJ-36).

## Qué cambió en esta versión

| Endpoint | Antes | Ahora | Acción del front |
| --- | --- | --- | --- |
| `POST /medical-appointments` sin `medicalCenterId` | 201 sin validar horario, turno ni cupo | **400** `["Indique el centro médico de la cita."]` (un solo mensaje) | Centro obligatorio en el formulario (hecho: `app` `8ca255d`) |
| `POST`/`PATCH /medical-appointments` con un centro del que el médico no es parte | Validaba solo el horario | **400** `El médico no está asignado a este centro médico.` | Ofrecer solo centros del médico |
| `PATCH /medical-appointments/:id` que reprograma una cita **sin** centro | Se aceptaba | **400** `Indique el centro médico de la cita para reprogramarla.` (hoy hay 0 citas sin centro) | Enviar `medicalCenterId` al reprogramar |
| Cupo diario | `maxDailyAppointments` del **primer** bloque del día | **Suma** de los bloques activos del día en el centro | Igual que el selector (`app` `8ca255d`) |
| `GET /medical-appointments/availability` | Misma forma | **Misma forma**. Nuevo: con el día lleno (cupo diario), **todos** los `slots` vienen `available: false` y `available: false` | El selector ya deshabilita todo con el aviso |
| `GET /auth/me` | `id, name, email, doctorId, modules` | + **`isAdmin`** (permiso `security.consultar`) y **`mustChangePassword`** | Usar `isAdmin` (hecho: `app` `418da1e`); llevar a cambiar contraseña si `mustChangePassword` |
| `PATCH /users/:id/reset-password` | No existía | Nuevo, ver abajo | Botón en la edición de usuario (hecho: `app` `418da1e`) |
| `PATCH /auth/change-password` | Mínimo 6 | Mínimo **8**; deja `mustChangePassword` en `false` | — |
| `POST /users`, `POST /users-security` | Mínimo 6 / sin mínimo | Mínimo **8** (`La contraseña debe tener al menos 8 caracteres`). El login sigue aceptando 6 | Mismo mínimo en los formularios (hecho: `app` `86f93ea`) |
| `POST /auth/login` | Solo límite por IP | 5 fallos de la **misma credencial** en 15 min → **429** `Demasiados intentos fallidos. La cuenta quedó bloqueada 15 minutos.` durante 15 min | Mostrar el `error` (ya lo hace) |
| `GET /users*`, `PATCH /users/:id` por `medico` / `enfermero` | 200 | **403** (se retiró `user.consultar`/`user.actualizar`) | Foto y datos propios por `GET /auth/profile` (`imageUrl`), no por `GET /users/:id` |
| `GET /allergies`, `/chronic-diseases`, `/medications` por `enfermero` | 403 | **200** (`parameters.consultar`) | — |
| `GET /auth/profile`, `GET /users/:id`, `GET /users` → `imageUrl` | Solo la última fila de `common_person_images`; quedaba `null` tras `POST /files/profile-photo` + `PATCH /auth/me` | **Foto efectiva**: `commonPerson.photoUrl` si existe; si no, la última imagen activa de `common_person_images`; si no, `null` | Leer solo `imageUrl` para el avatar (hecho: `app` `28da880`) |
| `GET /permissions/role/:roleId` | Siempre 404 | Lista `[{ module, action, permissionId, menuId, isActive }]`; rol inexistente o borrado → 404 | — (la pantalla usa `GET /roles/:id`) |
| `DELETE /roles/:id` | Borrado físico (500 si tenía usuarios) | Borrado **lógico**; con usuarios vivos → **409**; `superusuario`/`medico` → **400**; el nombre queda libre | Mostrar el `error` |
| Menús | `mammography-analysis` y `machine-learning` ocultos | Visibles: **"Bandeja de análisis IA"** (`url: /machine-learning/review-inbox`, `fa-inbox`) y **"Detector IA"** (`url: /machine-learning/cancer-detector`) | El sidebar usa `url` (ícono mapeado: `app` `39ede77`) |
| `DELETE /medical-centers/:id`, `/departments/:id`, `/patient/:id` | Borraban aunque hubiera citas pendientes | **409** `No se puede eliminar …: tiene N cita(s) pendiente(s) o en curso. Cancélelas o reprográmelas primero.` | Mostrar el `error` |
| `DELETE /medical-centers/:id/remove-doctor/:doctorId` | Solo quitaba el centro | Quita también sus departamentos de ese centro y **borra** sus bloques de horario allí; con citas abiertas allí → **409** | — |
| `PATCH /doctors/:id` con `medicalCenterIds` distintos de los actuales | El médico podía agregarse centros | Solo **administrador** (403); reenviar los mismos centros pasa; quitar un centro aplica la limpieza anterior | Hecho: `app` `8cda52c`, `f1a5c30` |
| `PATCH /doctors/:id`, `POST`/`PATCH /departments` con ids de especialidad/centro inexistentes | Se descartaban en silencio | **400** `Especialidades inexistentes: <ids>.` / `Centros médicos inexistentes: <ids>.` | Mostrar el `error` |
| Departamento | Sin indicador | Campo **`supportsMammography`** (boolean) en `POST`/`PATCH /departments`, en `GET /departments*` y en `department` del detalle de la cita | Usarlo en vez del nombre (hecho: `app` `c39859f`) |
| `GET /patient`, `GET /patient/:id` (médico) | Solo pacientes con citas suyas | + los que **él registró** (`createdBy`) | — |
| `GET /patient*` (personal no médico, p. ej. enfermero) | Todos los pacientes | Registrados por él **o** con citas en **sus centros** (`users_medical_centers`); fuera de eso → 403 | — |
| `PATCH`/`DELETE /patient/:id` | Sin acotar | Misma regla que la lectura → **403** | Mostrar el `error` |
| `GET /patient/by-document` | Devolvía alergias, enfermedades y medicación, incluso de borrados | Sin acotar (sirve para agendar), pero **solo identificación** (`id`, `patientCode`, `bloodType`, `commonPerson`, …) y sin borrados (404) | No leer `allergies`/`chronicDiseases`/`medications` de esa respuesta |
| `GET /patient?isActive=` | Ignorado; orden por UUID | Filtra; orden **apellido, nombre** (`order` = ASC/DESC) | — |
| Persona (`commonPerson` en pacientes, usuarios, médicos) | — | **`birthDate`** (`YYYY-MM-DD`, no futura) y **`sex`** (`F`/`M`), opcionales | Campos en el formulario (hecho: `app` `ac64c6a`) |
| `maritalStatus` del paciente | Texto libre | Solo `soltero`, `casado`, `divorciado`, `viudo`, `union_libre` → si no, 400 | El `select` ya usa esos valores |
| `PATCH /medical-appointments/:id/finish-consultation` | Permiso `appointments.crear`; historia `in_progress` | Permiso **`medical-history.crear`**; historia creada **`completed`** | — |
| `medicalHistory` del cierre (y `POST /medical-history`) | Exámenes solo como texto | **`requestedExams: [{ name, notes? }]`** (máx. 30; `name` ≤ 200, `notes` ≤ 500), guardado en la historia y devuelto en ella | Enviarlo (hecho: `app` `468b14b`) |
| `GET /medical-history/patient/:id` | Incluía historias borradas | Sin borradas | — |
| `POST /mammography-analyses` | — | Acepta **`doctorAgreement`**: `accepted` \| `rejected` \| `uncertain`. Un archivo con análisis vivo **devuelve el existente** sin volver a llamar al modelo | Enviar el acuerdo estructurado (hecho: `app` `1403b22`) |
| `PATCH /mammography-analyses/:id/review` | Sobrescribía | Acepta **`reviewAgreement`**; segunda revisión → **409** `El análisis ya fue revisado; la revisión no se sobrescribe.` | Ofrecer revisar solo si `isReviewed = false` |
| `DELETE /mammography-analyses/:id` | No existía | Nuevo: cuerpo `{ "reason": "…" }` obligatorio → **204**; revisado → 409; de otro médico → 403 | Hecho: `app` `1403b22` |
| Respuesta de análisis | `label` con BI-RADS | `label` = `Sospechoso de malignidad` / `No sospechoso`; + `doctorAgreement`, `reviewAgreement` | Las etiquetas del front coinciden |
| `GET /dashboard/*` | `appointments.consultar`; personal no médico → todo en cero | Acepta también **`patient.consultar`**; el personal ve los datos de **sus centros**; + campo **`scope`** (`global`/`doctor`/`centers`). `totalMlAnalyses` cuenta **análisis**; pacientes, médicos, centros y departamentos acotados para no administradores | Hecho: `app` `7722e61`, `6155094` |
| `POST /files/profile-photo`, `GET /files/profile-photos/:ownerId/:file` | Exigían `file.crear` / `file.consultar` | **Solo sesión** para la foto propia; `ownerId` ajeno → 403 salvo administrador; sin `ownerId` = el usuario | — |
| `POST /files/common-person-image`, `/common-person-photo`, `/doctor-photo` | Dueño tomado del cuerpo | La persona propia, un paciente que el actor puede editar, o administrador → si no, **403** | Subir la foto **después** de crear al paciente (hecho: `app` `2cf0a91`) |
| `POST /users` con `commonPerson.photoUrl` de una foto subida por quien crea | La foto quedaba en la carpeta del administrador | Se **mueve** a la carpeta del usuario nuevo y `photoUrl` se reescribe (devuelto en la respuesta) | Ninguna |
| `GET /audit/access-log` | No existía | Nuevo, permiso `logs.consultar` (ver abajo) | Opcional: pantalla de bitácora |
| `GET /health` | Base y memoria | + `redis` y `detector` | — |

### Lo que **no** cambió

- `GET /medical-appointments/availability`: mismas claves (`occupiedSlots`, `schedule[{ startTime, endTime, maxDailyAppointments }]`, `slots[{ start, end, capacity, booked, available }]`, `currentCount`, `available`). `schedule[].maxDailyAppointments` sigue siendo el **del bloque**; el cupo del día es la suma de esos valores.
- `prediction`, `probability`, `malignancyProbability`, `rawScore`, `threshold` de los análisis.
- `GET /mammography-analyses/inbox` sigue existiendo sin consumidor.

## Payloads reales

`GET /auth/me` (cmendoza):

```json
{"code":200,"data":{"id":"00709eb2-63a2-4168-ad25-2eec990476e8","name":"cmendoza","email":"cmendoza@medos-demo.example.com","doctorId":"c5104979-23ae-45a7-aeb1-199baa3c48f8","isAdmin":false,"mustChangePassword":false,"modules":"<cifrado>"}}
```

`GET /medical-appointments/availability?doctorId=…&date=2026-10-20&medicalCenterId=…` (recortado a 2 turnos):

```json
{"code":200,"data":{"occupiedSlots":[{"start":"2026-10-20T15:00:00.000Z","end":"2026-10-20T15:30:00.000Z","appointmentNumber":"APT-2026-00264"}],"schedule":[{"startTime":"08:00:00","endTime":"16:00:00","maxDailyAppointments":16}],"slots":[{"start":"2026-10-20T12:00:00.000Z","end":"2026-10-20T12:30:00.000Z","capacity":1,"booked":0,"available":true},{"start":"2026-10-20T12:30:00.000Z","end":"2026-10-20T13:00:00.000Z","capacity":1,"booked":0,"available":true}],"currentCount":2,"available":true}}
```

`PATCH /users/:id/reset-password` (permiso `user.actualizar` **y** `role.actualizar`; la propia cuenta → 400):

```json
// request
{ "newPassword": "Temporal2026" }
// 200
{"code":200,"data":{"message":"Contraseña restablecida. El usuario deberá cambiarla al iniciar sesión."}}
```

Cierre de consulta con exámenes (`PATCH /medical-appointments/:id/finish-consultation`):

```json
{ "medicalHistory": { "consultationDate": "2026-10-27", "reasonForVisit": "Control", "diagnosis": "Control",
  "requestedExams": [ { "name": "Mamografía bilateral", "notes": "Control anual" }, { "name": "Ecografía mamaria" } ] } }
```

Análisis y revisión:

```json
// POST /mammography-analyses
{ "appointmentFileId": "<uuid>", "notes": "Comentario libre", "doctorAgreement": "accepted" }
// PATCH /mammography-analyses/:id/review
{ "reviewNotes": "Coincide", "reviewAgreement": "accepted" }
// DELETE /mammography-analyses/:id  → 204
{ "reason": "Se analizó la imagen de otro estudio" }
```

`GET /dashboard/stats` (enf.ramirez):

```json
{"code":200,"data":{"totalAppointments":165,"pendingAppointments":19,"completedAppointments":118,"cancelledAppointments":8,"todayAppointments":0,"totalPatients":58,"totalDoctors":6,"totalMedicalCenters":1,"totalDepartments":5,"totalRecipes":0,"totalHistories":118,"totalMlAnalyses":35,"isDoctor":false,"doctorId":null,"medicalCenterIds":["3e6d7175-75a9-4e8b-b973-f5c41f3a362a"],"scope":"centers"}}
```

`GET /audit/access-log?userId=&resource=&resourceId=&action=read|write&from=&to=&page=&limit=` (máx. 100):

```json
{"code":200,"data":[{"id":"5625e4a5-5f9a-4150-a9c7-c80bc199567a","createdAt":"2026-10-04T14:47:41.954Z","userId":"00709eb2-63a2-4168-ad25-2eec990476e8","method":"GET","path":"/mammography-analyses/recent","resource":"mammography-analyses","resourceId":null,"action":"read","statusCode":200,"ip":"::ffff:172.19.0.1"}],"total":16,"page":1,"limit":1}
```

Se registran todas las escrituras exitosas (salvo login/refresh/logout) y las lecturas de `/patient`,
`/medical-history`, `/recipes`, `/mammography-analyses`, `/medical-appointments` y
`/files/appointment-files`. Nunca el cuerpo ni la query string.

`GET /health`:

```json
{"code":200,"data":{"status":"ok","info":{"database":{"status":"up"},"memory_heap":{"status":"up"},"redis":{"status":"up"},"detector":{"status":"up"}},"error":{},"details":{…}}}
```

## Códigos de error nuevos

| Código | Cuándo | Mensaje |
| --- | --- | --- |
| 400 | Cita sin centro / centro inválido | `Indique el centro médico de la cita.` |
| 400 | Médico fuera del centro | `El médico no está asignado a este centro médico.` |
| 400 | Cupo diario (suma de bloques) | `El doctor ya alcanzó el máximo de N citas para este día en este centro médico.` |
| 400 | Contraseña nueva corta | `… debe tener al menos 8 caracteres` |
| 400 | Ids inexistentes | `Especialidades inexistentes: …` / `Centros médicos inexistentes: …` |
| 400 | `sex`, `birthDate`, `maritalStatus` | `El sexo debe ser F o M` · `La fecha de nacimiento no puede ser futura` · `El estado civil debe ser uno de: …` |
| 403 | Paciente fuera del alcance | `No tiene acceso a este paciente.` |
| 403 | Centros del médico por no admin | `Solo un administrador puede cambiar los centros médicos de un médico.` |
| 403 | Foto ajena | `No puede cambiar la foto de otra persona.` |
| 409 | Borrado con citas abiertas | `No se puede eliminar … / retirar al médico del centro: tiene N cita(s) pendiente(s) o en curso…` |
| 409 | Rol con usuarios | `El rol '<nombre>' tiene N usuario(s) asignado(s); reasígnelos antes de eliminarlo.` |
| 409 | Revisión repetida / borrar revisado | `El análisis ya fue revisado; la revisión no se sobrescribe.` · `Un análisis revisado no se puede eliminar.` |
| 429 | Bloqueo por intentos | `Demasiados intentos fallidos. La cuenta quedó bloqueada 15 minutos.` |

## Datos en la base

- `first_login` pasó a `false` en las 18 cuentas que lo tenían sin efecto: `mustChangePassword` solo es `true` tras un restablecimiento o un alta con `firstLogin: true`.
- `supportsMammography` sembrado: `true` en "Mamografía", "Mastología" y "Radiología y Mamografía".
- `birthDate`/`sex`: **null** en todas las personas existentes (no hay de dónde inferirlos); el seed los carga en pacientes nuevos.
- `doctorAgreement`: rellenado en 20 análisis desde el texto de `notes`; `reviewAgreement`: **null** en los anteriores (la nota de revisión era libre).
- Historias de consultas cerradas: las 224 pasaron a `completed`.
- Etiquetas: 94 análisis pasaron a `Sospechoso de malignidad` / `No sospechoso`, también en la respuesta cruda.

## Checklist de migración del front

- [x] Centro obligatorio y selector de turnos (`availability`).
- [x] `isAdmin` y `mustChangePassword` de `/auth/me`; restablecimiento de contraseña.
- [x] Mínimo de 8 caracteres en contraseñas nuevas.
- [x] `supportsMammography`, `birthDate`/`sex`, `requestedExams`, `doctorAgreement`/`reviewAgreement`, retiro de análisis.
- [x] Panel del personal con `patient.consultar`.
- [x] Foto del paciente después de crearlo.
- [x] Layout: foto del usuario por `GET /auth/profile` (`imageUrl`) en vez de `GET /users/:id` (`app` `28da880`); `imageUrl` ya devuelve la foto subida con `POST /files/profile-photo`.
- [x] Pantalla para `GET /audit/access-log` (`app` `22e13d6`); el menú `logs` apunta a `/audit/access-log` con el nombre "Bitácora de accesos".
