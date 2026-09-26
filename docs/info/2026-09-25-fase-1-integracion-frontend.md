# Fase 1 (integridad de datos) — Guía de integración para el frontend

> Fecha: 2026-09-25 · Backend `api-gestion-medica`, rama `dt/modules` · Plan: `app-gestion-medica/docs/plans/2026-09-25-plan-mejoras.md` (M-13 a M-25, sin M-16).
> Destinatario: quien mantenga los formularios de pacientes, médicos, usuarios, personas, recetas y el cierre de consulta en `app-gestion-medica`.

## 1. Datos generales

| Tema | Valor |
|---|---|
| Base URL | `environment.apiUrl` (local `http://localhost:8008`) |
| Autenticación | `Authorization: Bearer <access_token>` (sin cambios) |
| Envoltorio de éxito | `{ "code": <status>, "data": <contenido> }` (sin cambios) |
| Envoltorio de error | `{ "data": null, "error": <mensaje>, "statusCode": <status> }` (sin cambios) |

No hay endpoints nuevos ni campos nuevos en las respuestas. Cambian códigos de error y algunos comportamientos.

## 2. Qué cambió en esta versión

| # | Cambio | Endpoint | Acción del frontend |
|---|---|---|---|
| 1 | Cierre de consulta atómico: si algo falla, no queda historial ni receta y la cita sigue abierta; el reintento funciona | `PATCH /medical-appointments/:id/finish-consultation` | Ofrecer reintento ante un error (M-16, del frontend) |
| 2 | Ítem de receta con `medicationId` inexistente o borrado → **404** antes de escribir | cierre de consulta, `POST /recipes`, `PATCH /recipes/:id` | Mostrar el mensaje del backend |
| 3 | `POST /recipes` con historial, paciente o doctor inexistente o borrado → **404** (antes 400) | `POST /recipes` | Tratar 404 como error de datos, no como "ruta inexistente" |
| 4 | Documento duplicado → **409** (antes 400 o 500 con texto del driver) | `POST /users`, `PATCH /users/:id`, `POST /common-persons`, `PATCH /common-persons/:id`, `PATCH /doctors/:id`, `PATCH /patient/:id`, altas de médico y paciente | Mostrar `error` junto al campo documento |
| 5 | La persona se busca por **letra + documento**: `E-123` ya no se confunde con `V-123` | altas de usuario, médico, paciente y citas por documento | Enviar siempre `letter`/`documentLetter`. Sin letra, solo coincide una persona sin letra (hoy no hay ninguna) |
| 6 | Un paciente borrado ya no bloquea: registrar a la misma persona crea un paciente nuevo | `POST /patient`, `POST /medical-appointments` por documento | Ninguna; antes respondía 400 "ya está registrada" |
| 7 | Detalle de registros borrados → **404** | `GET /patient/:id`, `/doctors/:id`, `/recipes/:id`, `/medical-history/:id`, `/common-persons/:id`, `/users/:id`, `/departments/:id`, `/medications/:id` | Si se navega a un registro borrado, mostrar "no encontrado" |
| 8 | Se puede reutilizar el nombre de un centro borrado y el email/nombre de un usuario borrado | `POST /medical-centers`, `POST /users` | Ninguna |
| 9 | Nombre de especialidad sin distinguir mayúsculas: "Mastología" con "mastología" existente → 400 | `POST/PATCH /specialties` | Ninguna |
| 10 | Nombre de centro repetido por carrera → 409 | `POST /medical-centers` | Ninguna |

## 3. Qué NO cambió

- Formas de respuesta, rutas, permisos y DTO de entrada.
- `POST /users` con un email o nombre de usuario activo repetido sigue respondiendo **400** ("Error al crear el usuario: El correo electrónico o nombre ya está en uso.").
- El índice único de documentos de persona y el de código de especialidad **todavía no están activos** (esperan la depuración de datos, ver la tarea `docs/tasks/2026-09-25-003-fase-1-integridad.md`). La validación en el servicio sí lo está.

## 4. Errores (copiados del código)

| Status | `error` | Cuándo |
|---|---|---|
| 404 | `Los medicamentos con ID <ids> no existen o han sido eliminados.` | Ítems de receta |
| 404 | `El historial médico con ID <id> no existe o ha sido eliminado.` (igual para paciente y doctor) | `POST /recipes` |
| 409 | `El número de documento ya está registrado para otra persona.` | Documento repetido |
| 409 | `Ya existe un registro con esos datos.` | Otro valor único repetido que llegó a la base (por ejemplo, una persona que ya tiene usuario) |
| 409 | `Ya existe un centro médico con ese nombre.` | Carrera al crear un centro |
| 400 | `La cita ya está completada.` | Cierre repetido |

Ejemplo:

```json
{ "data": null, "error": "El número de documento ya está registrado para otra persona.", "statusCode": 409 }
```

## 5. Checklist

- [ ] Los formularios de persona muestran el 409 de documento junto al campo.
- [ ] El `errorInterceptor` no trata 404/409 como fallos de sesión.
- [ ] Se envía siempre la letra del documento.
- [ ] El cierre de consulta ofrece reintento (M-16).
