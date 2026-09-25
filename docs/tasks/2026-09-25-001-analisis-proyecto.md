# 2026-09-25-001 — Análisis y documentación del backend de la tesis

## Qué se pidió

- Analizar el proyecto de tesis completo, con foco en el backend NestJS `api-gestion-medica`.
- Revisar también su relación con el frontend Angular (`app-gestion-medica`) y el detector (`detector-cancer-de-mama`).
- Documentar arquitectura, patrones, módulos, modelo de datos, autenticación y permisos, endpoints, integración con el detector y cómo ejecutar, migrar y probar.
- Identificar riesgos, deuda técnica y discrepancias entre `ARCHITECTURE_BACKEND.md` y el código.
- Restricciones:
  - No modificar código fuente, no hacer commit y no tocar `.gitignore`.
  - Documentos en español neutro.

## Qué se hizo

1. **Guías leídas:** `ARCHITECTURE_BACKEND.md` (secciones de BD, guards, sesión, cifrado, colas, patrones y configuración) y `README.md`. De `MODULES_CONTEXT.md` y `AGENTS.md` solo se revisó el índice de títulos.
2. **Código leído:** `package.json` y `package-lock.json` (versiones), `main.ts`, `app.module.ts`, `configuration/*`, `database/*`, `auth/*` (guards, decoradores, servicio, controlador, cifrado), `redis-session/*`, `common/exceptions/*`, `common/interceptors/HttpResponse.interceptor.ts`, `logs` (servicio y controlador), `crypto.controller.ts`, `queues/*`, `mammography-analysis` (servicio y DTO) y `files` (servicio y controlador, en las partes de rutas de disco).
3. **Exploración delegada:** dos subagentes de solo lectura extrajeron las 36 entidades con sus relaciones y los 32 controladores con sus decoradores. Sus afirmaciones de mayor peso se contrastaron contra el código:
   - la ausencia de `@Permission` en `specialty.controller.ts`
   - `/logs/ui/api`
   - `EmailModule` sin importar
   - la doble join column entre `User` y `CommonPerson`
   - el montaje de Bull Board
4. **Integración con el detector:** se revisaron `app-gestion-medica/src/app/core/services/machine-learning/ml.service.ts`, `environments/*.ts`, `permissions-cipher.util.ts` y `detector-cancer-de-mama/main.py` y su `docker-compose.yml`.
5. **Documentos creados:**
   - `docs/info/2026-09-25-backend-arquitectura.md`: referencia de arquitectura y tabla de endpoints.
   - `docs/plans/2026-09-25-backend-hallazgos.md`: 24 hallazgos con severidad y evidencia, lo que está bien resuelto y las discrepancias con la guía.
   - `docs/tasks/2026-09-25-001-analisis-proyecto.md`: este documento.

## Decisiones

| Decisión | Motivo |
|---|---|
| Severidades según el criterio ALTA/MEDIA/BAJA del documento de hallazgos | Si se infla la severidad, se termina ignorando la lista entera |
| Marcar "a confirmar" H6 (reintento), H11 (Bull Board) y H13 (specs que fallan) | Dependen del comportamiento en ejecución, que no se pudo observar |
| No copiar valores de `sdfsdf` en ningún documento | Contiene secretos; solo se listan los nombres de las variables |
| Documentar el detector desde el código del frontend y de `main.py` | El backend no tiene ningún cliente HTTP hacia el detector |

## Cómo se verificó

- **Endpoints:** cada ruta y permiso de la tabla sale de los decoradores del controlador (lectura completa por subagente). Se verificaron a mano `auth`, `logs`, `crypto`, `files` (subidas y rutas con parámetros), `mammography-analysis` y `specialty`.
- **Hallazgos:** cada uno cita `archivo:línea`, leído directamente, salvo las líneas de entidades, que se tomaron del informe de entidades y se contrastaron en `user.entity.ts` y `common-person.entity.ts`.
- **`.gitignore`:** revisado. `docs/` no está ignorado (`git check-ignore docs/info/x.md` devolvió código 1). Los documentos quedan versionables, como se pidió.
- **Archivos `.sql`:** se buscaron con `rg --files -g '*.sql'` y no hay ninguno en el repositorio.

## Qué quedó fuera

- **Ejecución:** no hay `node_modules`, así que no se corrieron `npm test` ni `nest build`, ni se levantó la API. No hay línea base de pruebas ni de warnings.
- **`.env.example`:** no se pudo leer por una regla de denegación del entorno. Las variables se documentaron desde `configuration/validation.ts`.
- **Lectura parcial:** la lógica interna de `permission.service.ts` (1387 líneas), `medical-appointments.service.ts` (salvo `finishConsultation`, la numeración y la detección de admin), `dicom-converter.service.ts` (salvo la cabecera) y los templates `.hbs`.
- **Frontend Angular:** solo se revisaron los puntos de contacto con el backend y el detector.
- **Modelo ML:** no se evaluaron su calidad ni el preprocesamiento más allá de `main.py`.
- **Base de datos real:** no se verificaron los índices en `pg_indexes`. El índice único que se infiere del `OneToOne` en H6 no está confirmado.

## Pendiente (para quien continúe)

- [ ] Instalar dependencias y correr `npm test` y `npm run build` para fijar una línea base.
- [ ] Confirmar H11: `GET /admin/queues` sin cookie.
- [ ] Confirmar H1 con una petición de lectura `..%2F` en un ambiente local.
- [ ] Revisar en `pg_indexes` el índice único de `medical_histories.medical_appointment_id` (H6).
- [ ] Decidir si `sdfsdf` contiene secretos reales y, si es así, rotarlos (H12).
- [ ] Actualizar `ARCHITECTURE_BACKEND.md` con el módulo de mamografías y corregir las discrepancias de la §5 del documento de hallazgos.
- [ ] Documentar en la memoria de tesis el contrato de `probability` del detector (H8) y el flujo en el que el cliente decide el resultado (H7).

## Resultados de ejecución (2026-09-25)

**Comandos ejecutados:** `npm ci`, `npm run build`, `npx jest --ci`. Consultas de solo lectura a PostgreSQL local (sesión con `default_transaction_read_only = on`). Peticiones HTTP sin autenticar al contenedor `medos-backend` (puerto 8008).

| Verificación | Resultado |
|---|---|
| `npm ci` | OK. 1095 paquetes. `npm audit`: 67 vulnerabilidades (4 críticas, 28 altas, 26 moderadas, 9 bajas). |
| `npm run build` | OK, 0 errores y 0 advertencias. |
| `npm test` (línea base) | **8 de 8 suites fallan al compilar, 0 tests ejecutados.** Causa: `tsconfig.json` restringe `"types": ["node", "express", "multer"]`, por lo que ts-jest no ve `describe/it/expect/beforeEach` (TS2593/TS2304). No es una falla de lógica: la suite nunca llegó a correr. |
| Arranque local (`npm run start`) | **No ejecutado.** `SchemaInitService.onApplicationBootstrap` llama a `dataSource.synchronize()` sin condición, así que arrancar la API contra `bd_gestion_medica` puede alterar el esquema compartido. Clonar la base a una base temporal fue bloqueado por permisos. Queda pendiente de decisión del usuario. |
| Verificación de rutas | Se usó el contenedor `medos-backend` (imagen `tesis-backend` construida el 2026-06-12, posterior al último commit `3e96ca1` del 2026-06-09; el repositorio no tiene cambios sin confirmar fuera de `docs/`). |

**Rutas (sin token; 404 = ruta inexistente, 403 = ruta existente protegida por el guard):**

| Petición | Código | Conclusión |
|---|---|---|
| `PUT /roles/:id` | 404 | No existe (el frontend la usa en `role.service.ts:57`). |
| `PATCH /roles/:id` | 403 | Existe. |
| `POST /permissions` | 404 | No existe (el frontend la usa en `permission.service.ts:43`). |
| `PUT /permissions/:id` | 404 | No existe (el frontend la usa en `permission.service.ts:50`). |
| `PATCH /permissions/:id` | 403 | Existe. |
| `GET /health` | 403 | El health check queda detrás del guard global y responde 403, no 401, sin token. |

**Datos (solo lectura):** `seguridad.permisos` tiene 4 acciones (`crear`, `consultar`, `actualizar`, `eliminar`). El menú con slug `machine-learning` existe en `seguridad.menu` y tiene las 4 acciones asignadas a 2 roles en `seguridad.permisos_menus`; lo mismo ocurre con `mammography-analysis`. Los menús `appointments` y `mammography-analysis` comparten el nombre visible "Citas Médicas".

**Hallazgos estáticos:** confirmado el desajuste de verbos HTTP roles/permisos (PUT/POST contra PATCH). Refutado que falten permisos con prefijo `machine-learning` en la base.

**Servicios que quedaron en ejecución:** `medos-redis` (8010→6379), `medos-backend`, `medos-frontend`, `medos-ml-api` (ya estaban arriba antes de esta verificación; no se tocaron). `ctsalud-redis-local` (6379) pertenece a otro proyecto y no se usó.

## Resultados de ejecución — backend contra bd_gestion_medica (2026-09-25)

Arranque autorizado de forma explícita por el usuario, aun sabiendo que `SchemaInitService` ejecuta `dataSource.synchronize()`. No se modificó código ni configuración.

**Respaldo previo (PostgreSQL 14.6 local, `pg_dump` 14 del cliente local):**

- Completo: `C:\Users\dtoro\AppData\Local\Temp\claude\d---trabajo-dtoro-Documentos-tesis-app-gestion-medica\27e112e5-e02c-4965-9f33-c9a0fdebb755\scratchpad\bd_gestion_medica_pre_boot.dump` (`-Fc`, 283 KB, 245 entradas en `pg_restore -l`).
- Solo esquema: `...\scratchpad\schema_pre_boot.sql`.
- Conteo exacto de filas por tabla (41 tablas): `...\scratchpad\exactcounts_pre.txt`.
- Restauración, si alguna vez hiciera falta: `pg_restore -h localhost -U postgres -d bd_gestion_medica --clean --if-exists <ruta>\bd_gestion_medica_pre_boot.dump`.

**Arranque:** `PORT=8020 BULL_BOARD_PORT=8021 node dist/main` (puerto por variable de entorno; Redis según `.env`, `localhost:8010` = `medos-redis`). Arrancó sin errores: 186 rutas mapeadas, Swagger habilitado en `/api` (`NODE_ENV=development`). Dos advertencias `LegacyRouteConverter` por la ruta `/admin/queues/*` (sintaxis antigua de `path-to-regexp`; Nest la convierte sola). `synchronize()` no deja rastro en el log porque el logging de TypeORM está apagado. Log completo: `...\scratchpad\boot.log`. El proceso se detuvo al terminar; los contenedores no se tocaron.

**Diferencia de esquema:** `schema_pre_boot.sql` y `schema_post_boot.sql` son idénticos (`diff` sin salida). Los conteos de filas de las 41 tablas tampoco cambiaron. `synchronize()` no alteró nada porque las entidades ya coinciden con la base; el riesgo de H2 sigue vigente para el próximo cambio de entidad, pero este arranque no lo materializó.

**Pruebas de humo (instancia local, sin token):**

| Petición | Código | Conclusión |
|---|---|---|
| `GET /health` | 403 `Token requerido para esta petición` | Confirma H23. |
| `GET /api`, `GET /api-json` | 200 | Swagger público en desarrollo. |
| `PUT /roles/1` · `POST /permissions` · `PUT /permissions/1` | 404 | Rutas inexistentes: confirma el desajuste de verbos con el frontend. |
| `PATCH /roles/1` · `PATCH /permissions/1` | 403 | Existen y están protegidas. |
| `GET /logs/ui/api` | 403 | Protegida sin token. |
| `GET /admin/queues`, `GET /admin/queues/api/queues` | **200** | **Confirma H11:** Bull Board responde sin autenticación, con `readOnlyMode: false` y `allowRetries: true`. Cualquiera puede ver y operar la cola `emailQueue` (hoy vacía). |
| `GET /uploads/<inexistente>` | 404 con `ENOENT ... D:\_trabajo\...\uploads\...` | El estático responde antes de los guards, y el error expone la ruta absoluta del servidor (refuerza H22). |
| `GET /uploads/common-persons/.../*.webp` y `/uploads/<uuid>/.../*.jpg` en el contenedor (8008) | **200** `image/webp`, `image/jpeg` | **Confirma H5:** los archivos subidos se descargan sin token. La instancia local no tiene carpeta `uploads`, por eso se probó un archivo real del contenedor. |

**Login y lecturas autenticadas:** no se ejecutaron. El repositorio no tiene seeder ni credenciales de prueba documentadas (solo `PASSWORD_BULL` de ejemplo en `README.md`), y las contraseñas en base están con bcrypt. Queda pendiente con credenciales que aporte el usuario.

**H3 (lado de almacenamiento), consulta de solo lectura a `auditoria.error_log`:** de 651 filas, 572 contienen un encabezado `Bearer` y 58 contienen un campo `"password"`. No se imprimió ningún valor. Queda sin confirmar si `/logs/ui/api` los devuelve a un usuario autenticado (requiere login; además H14 indica que el chequeo `roleName === 'superusuario'` podría bloquear la vista para todos).

**Hallazgos estáticos contrastados en ejecución:**

| Hallazgo | Estado |
|---|---|
| H2 `synchronize()` al arrancar | Confirmado que se ejecuta; en este arranque no produjo cambios. |
| H3 logs con credenciales | Confirmado el almacenamiento; la exposición por `/logs/ui/api` sigue sin verificar. |
| H5 `/uploads` público | Confirmado. |
| H11 Bull Board fuera de los guards | Confirmado (deja de estar "a confirmar"). |
| H22 mensajes crudos | Reforzado: el 404 del estático revela la ruta absoluta. |
| H23 `/health` detrás del guard | Confirmado. |
| Verbos roles/permisos | Confirmado también en la instancia local. |
