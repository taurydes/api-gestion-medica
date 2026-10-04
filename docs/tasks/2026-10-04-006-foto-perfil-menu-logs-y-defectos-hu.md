# 2026-10-04-006 — Foto efectiva en `imageUrl`, menú `logs` y defectos hallados al revisar las HU

## Qué se pidió

Seguimientos de backend anotados por el agente de frontend en
`app-gestion-medica/docs/tasks/2026-10-04-006-bloque-mejoras-frontend.md` ("Pendiente para otros") y los
defectos de backend de la tabla "Inconsistencias encontradas al verificar" de
`app-gestion-medica/docs/tasks/2026-10-04-002-ingenieria-inversa-hu.md`:

1. `GET /auth/profile.imageUrl` se derivaba solo de `common_person_images`; la foto de `POST /files/profile-photo`
   (`commonPerson.photoUrl`) no aparecía. Unificar en `/auth/profile`, `GET /users/:id` y `GET /users`.
2. Menú `logs`: `url = /audit/access-log`, nombre "Bitácora de accesos" (la pantalla del front existe: `app` `22e13d6`).
3. Documento de mejoras del front: fila MJ-39 y línea "Estado" de la cabecera (commits aparte en `app-gestion-medica`).
4. Nota de credenciales de demo en el QA histórico que cita `mario` / `QaSuper123!`.
5. Defectos 1–4, 6–11, 16 y 17 de la tabla de inconsistencias (ver bitácora).

## Bitácora

| Commit | Contenido |
|---|---|
| (pendiente) | `imageUrl` = `commonPerson.photoUrl` → última imagen activa → `null`, en perfil propio, detalle y listado de usuarios; specs con el `UserService` real |

## Decisiones

- **Prioridad de la foto**: `commonPerson.photoUrl` gana sobre `common_person_images` porque es lo que escribe el
  flujo vigente (`POST /files/profile-photo` + `PATCH /auth/me`); la tabla de imágenes es el camino anterior y queda
  como respaldo. Misma regla que ya usaba `appointment-response.dto.ts` para pacientes y médicos, pero invertida: ahí
  la tabla gana porque esos registros nunca pasan por `profile-photo`. No se tocó para no cambiar un contrato que el
  front ya consume.
- **`/auth/me`** no expone foto; no se tocó.

## Verificación

(pendiente)

## Lo que quedó fuera

(pendiente)
