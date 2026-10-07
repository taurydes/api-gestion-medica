# 2026-10-07-001 — Reemplazo de Swagger UI por Scalar API Reference

## Qué se pidió

- Sustituir Swagger UI por Scalar (`@scalar/nestjs-api-reference`) como interfaz de la documentación.
- Mantener `@nestjs/swagger`: genera el documento OpenAPI a partir de los decoradores de los controllers.
- Conservar la ruta, el endpoint JSON, las condiciones de entorno y el esquema bearer (JWT) para "Try it".
- Revisar CSP (helmet), access-log y throttling. Actualizar README/docs y el `docker-compose.yml` de `tesis/`.
- Sin commit (revisión del orquestador). No tocar `.env.example`.

## Estado previo

- `src/main.ts`: `DocumentBuilder` (título `APP_NAME`, `addBearerAuth()`) + `SwaggerModule.setup('api', ...)`.
- Solo con `NODE_ENV === 'development'` (default `development` si falta). Sin basic auth ni guard: era público en dev.
- Rutas: `/api` (UI), `/api-json`, `/api-yaml`. En el contenedor (`NODE_ENV=production`) todas daban 404.

## Qué se hizo

| Archivo | Cambio |
|---|---|
| `src/docs/api-docs.setup.ts` (nuevo) | `setupApiDocs(app, title)`: arma el documento, `SwaggerModule.setup('/api', ..., { ui: false, raw: true })` (solo JSON/YAML) y monta Scalar en `GET /api` con `url: '/api-json'` y `preferredSecurityScheme: 'bearer'` |
| `src/main.ts` | Llama a `setupApiDocs` dentro del mismo `if (NODE_ENV === 'development')`; logs de arranque actualizados |
| `src/docs/api-docs.setup.spec.ts` (nuevo) | 3 tests que levantan una app Nest real con un controller de prueba y llaman a las rutas con supertest |
| `test/esm-to-cjs.transformer.js` (nuevo), `package.json` (`jest`) | Transformer de Jest que pasa a CommonJS los paquetes `@scalar/*` (son ESM puro); `transformIgnorePatterns` deja de ignorarlos |
| `package.json`, `package-lock.json` | `+ @scalar/nestjs-api-reference@^1.2.27`; `- swagger-ui-express` (no se importaba en ningún lado; `@nestjs/swagger` trae su propio `swagger-ui-dist`) |
| `README.md`, `ARCHITECTURE_BACKEND.md`, `docs/info/2026-09-25-backend-arquitectura.md`, `.github/copilot-instructions.md`, `.github/instructions/ESTRUCTURA-PROYECTO.instructions.md` | Swagger UI → Scalar en `/api`, OpenAPI en `/api-json` |
| `../docker-compose.yml` (fuera del repo) | Solo el comentario de `NODE_ENV=production` |

## Rutas

| Ruta | Antes | Ahora |
|---|---|---|
| `GET /api` | Swagger UI | Scalar (HTML) |
| `GET /api-json` | OpenAPI JSON | Igual |
| `GET /api-yaml` | OpenAPI YAML | Igual |
| `GET /api/swagger-ui*` | Assets de Swagger UI | 404 |

## Decisiones

| Decisión | Razón |
|---|---|
| Scalar en `/api`, no en `/docs` | Misma ruta que Swagger UI: marcadores, README, guía de frontend (`/api` → 404 en contenedor) y comentario del compose siguen valiendo; no hace falta redirección |
| `httpAdapter.get('/api')` y no `app.use('/api')` | `app.use` es prefijo: devolvería el HTML para cualquier `/api/*` |
| `raw: true` (JSON + YAML) | Conserva `/api-yaml`, que también existía |
| Misma condición `NODE_ENV === 'development'` | Producción sigue sin documentación (M-62) |
| Import estático de Scalar en `main.ts` | El paquete requiere un dependiente ESM con `require()`. Node 20.20.2 del contenedor tiene `process.features.require_module === true`; verificado abajo |
| Transformer propio en vez de ts-jest para `@scalar/*` | ts-jest emitía ESM para esos `.js` (paquete `type: module`) aun con `module: commonjs`; `ts.transpileModule` da CJS de forma determinista |
| CDN por defecto de Scalar (sin fijar versión) | Solo en desarrollo; no hay helmet ni CSP en el proyecto, así que el script de jsDelivr carga sin cambios |

## CSP

- El proyecto no usa helmet ni emite `Content-Security-Policy` (verificado: sin `helmet` en `src/` ni `package.json`; la respuesta de `/api` no trae la cabecera).
- Scalar carga `https://cdn.jsdelivr.net/npm/@scalar/api-reference/esm.js` como `<script type="module">`. Si en el futuro se agrega helmet, habrá que permitir `cdn.jsdelivr.net` en `script-src` para `/api` o pasar `nonce`.

## Access-log y throttling

- `AccessLogInterceptor` y `ThrottlerGuard` son de Nest: no se ejecutan en rutas montadas directo en el adapter de Express (`/api`, `/api-json`), igual que antes con Swagger.
- Además `/api` no está en `AUDITED_READ_PREFIXES`. No contamina la auditoría.

## Verificación

- `npm run build`: 0 errores.
- `npx jest --runInBand`: **97 suites / 786 tests** en verde (baseline anterior 96 / 783; +1 suite, +3 tests).
- Smoke sobre el `dist/` compilado (script en el scratchpad, app Nest mínima con `setupApiDocs`), en Node 22.20.0 local y en Node 20.20.2 dentro de la imagen `tesis-backend`:
  - `/api` → 200 `text/html`, script `cdn.jsdelivr.net/npm/@scalar/api-reference/esm.js`, config con `/api-json` y `preferredSecurityScheme`, sin cabecera CSP.
  - `/api-json` → 200, `openapi 3.0.0`, `securitySchemes.bearer = { type: http, scheme: bearer, bearerFormat: JWT }`.
  - `/api-yaml` → 200; `/api/swagger-ui-init.js` → 404.
- `curl -I` al bundle de jsDelivr → 200.

## Qué quedó fuera

- No se levantó la app completa (`AppModule`) en modo desarrollo: registraría los schedulers de BullMQ en el Redis compartido. La generación del documento (`SwaggerModule.createDocument`) no cambió respecto de la versión anterior.
- No se reconstruyó el contenedor: corre con `NODE_ENV=production`, donde la documentación no existe.
- No se probó visualmente "Try it" en el navegador.
- `eslint` del spec reporta los mismos `no-unsafe-*` que el resto de los specs del repo (ruido preexistente del proyecto de tipos).

## Pendiente

- Revisión del orquestador y commit.
