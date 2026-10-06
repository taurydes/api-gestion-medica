# 2026-10-06-001 — Menú por permiso `module`, firma/sello del médico y verificación de recetas

## Qué se pidió

1. Que el menú lateral no dependa de los permisos CRUD (`medico` veía "Roles" por tener `role.consultar`): nueva acción
   de sistema `module` ("Ver módulo en el menú"), matriz por rol en migración, árbol de menús filtrado por
   `<slug>.module`, columna `module` en la matriz de permisos.
2. Firma y sello del médico: columnas nuevas, endpoints propios (`/doctors/me/...`) y de admin (`/doctors/:id/...`),
   `GET /doctors/me`, y el PDF de receta imprimiéndolos (con hash de caché actualizado).
3. Verificación anti-falsificación: `recipes.verification_code`, QR + código + URL en el PDF, endpoint público
   `GET /public/recipes/verify/:code` limitado y auditado.
4. Tests por regla, verificación contra la API real, guía de integración y este documento.

Contrato fijado por el agente de frontend; guía: `docs/info/2026-10-06-modulos-firma-verificacion-integracion-frontend.md`.

## Bitácora

| Commit | Contenido |
|---|---|
| `826f217` | `PermissionActionsMenu.MODULE`, migración `MenuModulePermission1790521100000` (acción + matriz), `getMenusForUserAndRole` filtra por `module`, spec `menu-module-visibility` |
| `9461258` | Migración `DoctorSignatureStamp1790521200000`, `DoctorCredentialsService/Controller`, `GET /doctors/me`, spec `doctor-credentials` |
| `31fc470` | Migración `RecipeVerificationCode1790521300000` (columna, backfill, NOT NULL, índice único), código en el alta, `RecipeVerificationService/Controller`, acción `recipe_verify` en la bitácora, spec `recipe-verification` |
| `28642ea` | PDF: firma, sello, QR (nodo `qr` nativo de pdfmake), código, URL y leyenda; `FRONTEND_URL` en Joi; hash incluye imágenes y URL; spec `recipe-pdf-credentials` |
| `7377de8` | Segunda vuelta (pedido del coordinador): se borran `setPermissionActionStatus` y `SetPermissionStatusDto`. `rg` en `src` y `test`: sin llamadores ni rutas; el DTO solo se reexportaba |
| `a1682a8` | Tercera vuelta: se revoca `role.consultar` a `medico` (abría `/roles` por URL) |
| `217ac14` | `doctorsCount` en lista y detalle de departamentos (`loadRelationCountAndMap`, excluye médicos borrados); el front dejaba de contar desde `GET /doctors`, que está acotado al propio médico |
| `675e8a8` | El stub de query builder de `test/in-memory-db.ts` gana `leftJoinAndSelect` y `loadRelationCountAndMap` (los usa el detalle con conteo); el spec afirma que el detalle sigue filtrando `deletedAt IS NULL` |
| `a0bb4e4` | Imágenes 404: `seed-demo.js` valida las 4 mamografías fuente antes de sembrar, cuenta al final las referencias sin archivo y gana `--check-files`; SQL `docs/info/migrations/2026-10-05-referencias-a-archivos-perdidos.sql` |

## Matriz `<slug>.module`

| Rol | Menús |
|---|---|
| superusuario | Los 27 menús no borrados (visibles y ocultos) |
| medico | `menu` (Inicio), `medical-center` (grupo), `departments`, `patient`, `appointments`, `recipe`, `medical-history`, `mammography-analysis`, `machine-learning`, `profile` |
| enfermero | `menu`, `medical-center`, `patient`, `profile` |
| qa_rol_inactivo, qa_f2_perm | ninguno |

Fuera para `medico`: Seguridad (Usuarios, Roles, Permisos), Doctores (hijo de Departamentos), Bitácora, Bull Board y
el resto de módulos técnicos ocultos. Los permisos CRUD no se tocaron.

## Decisiones

| Decisión | Motivo |
|---|---|
| Una sola fila `module` en `seguridad.permisos`; "para cada menú" = se otorga por (rol, menú) en `permisos_menus` | Es el modelo existente: las acciones son globales y la matriz es rol × menú × acción. La columna aparece sola porque la matriz del front lee el catálogo `GET /permissions` |
| `module` entra en `PermissionActionsMenu` | `SYSTEM_ACTIONS` sale de ese enum, así queda no borrable / no desactivable (409) sin código extra |
| El árbol se arma desde `getRolePermissions` (cacheado) filtrando `action === 'module'` | Reutiliza la caché por rol y su invalidación en cada cambio de la matriz; la consulta anterior traía cualquier concesión |
| Padre visible si tiene `module` propio **o** un hijo visible | Contrato ("parents shown if any child is visible") y mantiene la regla previa |
| `profile.module` para medico y enfermero | "Mi Perfil" está oculto (`es_visible = false`); no cambia el sidebar, pero deja la concesión coherente si se hace visible |
| Rutas literales (`me/signature`, `:id/stamp`) en vez de `:kind` | Un parámetro en un controlador registrado antes que `DoctorsController` capturaba `DELETE schedules/:blockId` y `GET :doctorId/schedules` (ParseUuid/ParseEnum → 400). Verificado: `GET /doctors/:id/schedules` sigue en 200 |
| `DoctorCredentialsController` va primero en `controllers` | `GET /doctors/me` debe resolverse antes que `GET /doctors/:id` |
| Permisos: `/doctors/me` solo autenticado; `me/*` escritura `profile.actualizar`; `:id/*` `doctors.actualizar`/`doctors.consultar` + dueño o admin | `me` es el perfil propio (módulo "Mi Perfil"); `:id` es gestión de médicos (módulo Doctores). El 404 de `/doctors/me` del contrato exige no poner permiso de lectura (el enfermero no tiene `profile.*`) |
| Re-codificar a PNG con `sharp` | pdfmake no lee WebP; además quita EXIF y normaliza tamaño (≤ 1000×1000) |
| Columnas con `select: false` | Las rutas internas no salen en `GET /doctors/:id`, ni embebidas en recetas/citas |
| Imagen faltante en disco → el PDF sale sin ella | Un archivo perdido no debe impedir imprimir la receta |
| Código de verificación = `randomUUID()` sin guiones (32 hex, 122 bits) | Mismo formato que el backfill (`gen_random_uuid()`, nativo en PG 14), URL-safe, sin dependencias |
| Código generado en la app, sin `DEFAULT` en la BD | Las recetas solo se crean por `RecipeService` (el seeder usa la API); evita dos generadores |
| QR con el nodo `qr` nativo de pdfmake, no el paquete `qrcode` | Mismo resultado sin dependencia nueva |
| 404 del verificador como cuerpo `{valid:false}` (no excepción) | El filtro de errores reemplaza el cuerpo por `{data:null,error}`; además no ensucia el log de errores con cada código mal escrito |
| Recetas `cancelled` o borradas → 200 `valid:false` + `status`; `dispensed`/`expired` siguen `valid:true` | `valid` mide autenticidad; el estado lo interpreta el front |
| La bitácora guarda el id de la receta, no el código | El código funciona como secreto impreso; el id basta para saber qué se consultó |
| Throttle `long` 10/60 s solo en el verificador | El resto conserva los límites globales |

## Verificación

| Qué | Resultado |
|---|---|
| `npx jest --ci` | **722/722** (baseline anterior 694; +28). Tras borrar `setPermissionActionStatus`: 722/722. Una corrida intermedia dio timeout de 5 s en `documents.spec` ("an item dose"): ese test tarda 168 ms aislado; la siguiente corrida completa pasó. Es contención de CPU, no del cambio. Estabilizado en `48dd2e7`: los tests de caché por hash usan un `renderPdf` falso (de ~170 ms a ~45 ms cada uno); el render real sigue cubierto por el worker y el builder. Tres corridas seguidas: 722/722 ×3 |
| `npm run build` / `tsc -p tsconfig.build.json --noEmit` | 0 errores |
| Migraciones: `run` → `revert` → `run` de cada una | OK |
| `migration:generate --dryrun --check` tras cada migración | "No changes in database schema were found" (3 veces) |
| Índice `UQ_permisos_menus_rol_menu_permiso_active` con un `module` duplicado | 23505 |
| `UQ_recipes_verification_code` en `pg_indexes` + UPDATE duplicando un código | 23505 |
| Backfill | 198 recetas, 198 códigos distintos, 0 fuera de `^[0-9a-f]{16,64}$` |
| Backend reconstruido (`docker compose ... up -d --build backend`) | OK |
| `GET /permissions/me` `cmendoza` | Inicio, Centros Médicos › Departamentos, Pacientes, Citas, Recetas, Historial, Bandeja IA, Detector IA. Sin Seguridad/Usuarios/Roles/Permisos/Doctores/Bitácora |
| `admin.caracas` | Todos los visibles (incl. Bitácora, Seguridad › 3, Doctores) |
| `enf.gonzalez` | Inicio, Centros Médicos › Pacientes |
| `GET /doctors/me` | `cmendoza` 200 con flags; `enf.gonzalez` 404 "El usuario no tiene perfil médico." |
| Subida `cmendoza` firma y sello | 201; PDF disfrazado → 400; 2,1 MB → 413 |
| `lgutierrez` sobre la firma de `cmendoza` | POST 403, GET 403, DELETE 403; anónimo 401; propio y admin 200 `image/png` `private, no-store` |
| PDF de `REC-2026-00008` | 1 página, imágenes embebidas (4 objetos `/Subtype /Image`: 2 PNG + sus máscaras alfa), `/URI (http://localhost:8007/verificar/24fc02e8…)` |
| `GET /public/recipes/verify/<code>` | 200 con los campos seguros; desconocido 404 `{valid:false}`; consulta 11 en el minuto → 429 |
| `auditoria.access_log` | Filas `recipe_verify` con 200/404, `user_id` null, sin el código |
| `npx jest --ci` tras `675e8a8`/`a0bb4e4` | **727/727** (baseline 722, +5) |
| Reconstrucción `backend frontend` + `npm run e2e` del front | Ver la tarea 2026-10-06-002 del front: 42 passed (2 *flaky* al reintento) |

## Archivos perdidos (imágenes 404)

- Recorrido de todas las columnas de ruta (`appointment_files`, `mammography_analyses.image_path`, `common_person_images`, `doctor_images`, `medical_center_images`, `doctors.signature_path`/`stamp_path`, `persona_comun.photo_url`, `medical_centers.image_url`) contra el volumen de `medos-backend`.
- **Antes: 94 rotas** (48 archivos de cita + sus 16 análisis, 16 fotos de persona, 5 de médico, 8 de centro, 1 `image_url`). Todas eran subidas de QA (pacientes Martha Gonzales y Esteban Marquez, médicos julio/daniel, 2026-03 a 2026-06), ninguna del seed. Los originales no están ni en el volumen ni en el host.
- Decisión: baja lógica, no re-derivar desde las 4 mamografías fuente: cada análisis guarda la predicción de su imagen, y otra imagen mostraría un resultado ajeno. Sin foto, la UI muestra iniciales.
- SQL aplicado el 2026-10-05 (cabecera, verificación previa y posterior en el archivo). **Después: `--check-files` → 257 referencias, 0 rotas.**
- Por la API (todas las rutas de archivo de la base, 255): `admin.caracas` 255 × 200; `cmendoza` 200 en las suyas (16 archivos, 14 análisis, fotos), 403 en las de otros médicos, **0 × 404**.

## Fuera de alcance / pendiente

- Menús creados después por `/menu` no reciben `module` automáticamente: hay que otorgarlo en la matriz.
- Sin receta `cancelled` en la base: ese caso se cubre por test, no por la API real.
- `cmendoza` quedó con firma y sello sintéticos (rectángulos) de la verificación; reemplazables desde "Mi perfil".
- El front decide qué hacer con rutas a las que el usuario tiene CRUD pero no `module` (p. ej. `/roles` para medico).
