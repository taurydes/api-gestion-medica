# Fase 3 — Integración frontend: predicción en el servidor (M-39, M-40, M-50)

- **Base URL:** `http://localhost:8008` (Docker). Rutas bajo `/mammography-analyses`.
- **Auth:** `Authorization: Bearer <access_token>`; permisos `mammography-analysis.crear` (POST) y `mammography-analysis.consultar` (GET).
- **Envoltorio:** éxito `{ "code": <status>, "data": <payload> }`; error `{ "data": null, "error": "<mensaje o lista>", "statusCode": <status> }`.
- **El navegador ya no llama al detector.** El puerto 8009 sigue publicado hoy, pero `/predict` exige `X-Detector-Secret` (401 sin él): el frontend no debe usarlo.

## Qué cambió en esta versión

| Cambio | Acción del frontend |
|---|---|
| `POST /mammography-analyses` ahora es **JSON** `{ appointmentFileId, notes? }`; el backend carga la imagen guardada, llama al detector y guarda su respuesta | Subir primero el archivo (`POST /files/appointment-upload`, sin cambios) y luego llamar con el `id` devuelto. Quitar `file`, `prediction`, `probability`, `status`, `label`, `rawResponseJson` |
| `prediction`, `probability`, `status`, `label`, `rawResponseJson`, `rawResponse`, `rawScore`, `malignancyProbability`, `threshold`, `modelVersion` en el cuerpo → **400** | No enviarlos nunca |
| Nuevo `POST /mammography-analyses/preview` (multipart `file`, máx. 20 MB, no guarda) | Usarlo en el detector independiente y en la vista previa de la consulta en lugar de `/predict` |
| Respuesta: campos nuevos `malignancyProbability`, `rawScore`, `threshold`, `modelVersion`, `notes` | Mostrar `malignancyProbability` como "Probabilidad de malignidad"; `probability` es "Confianza del modelo en la clase predicha" |
| `stats.highRisk` = análisis que el modelo clasificó como malignos (`status = 'danger'`, mismo umbral que `threshold`); antes contaba benignos con confianza ≥ 80 | Rotular la tarjeta "Clasificados como malignos por el modelo" (no "≥ 80 %"): un benigno con malignidad 80–85 no cuenta |
| `minProbability` filtra por `malignancyProbability` (bandeja y ranking) | Rotular el filtro como probabilidad de malignidad |
| Grupos de la bandeja: nuevo `maxMalignancyProbability` | Opcional |
| Un médico solo puede analizar archivos de **sus** citas (403) | Mostrar el mensaje |
| Detector caído → 503 "El servicio de análisis no está disponible." | Mostrar aviso y permitir reintentar |
| `POST /files/appointment-upload`: imagen raster > 20 MB → 413; DICOM hasta 100 MB; acepta `application/dicom` | Validar tamaño antes de subir |
| `POST /files/dicom-convert`: máximo 100 MB (antes 300 MB) | Ídem |
| Cuerpos JSON: máximo 30 MB (antes 350 MB) | Ninguna (el frontend no envía base64 grandes) |

**Qué NO cambió:** rutas `GET /inbox`, `/recent`, `/stats/daily`, `/appointment/:appointmentId`, `/:id`, `/:id/image`, `PATCH /:id/review`; el **orden de urgencia** de la bandeja; `probability` conserva su nombre y su valor (confianza en la clase, 0–100) — ojo: **no** es la probabilidad de malignidad; `maxProbability` de los grupos sigue siendo sobre `probability`. `GET /:id` sigue devolviendo la entidad completa (ahora con los campos nuevos).

**¿Hay datos?** Sí: las 25 filas previas se rellenaron con la migración (`malignancyProbability`, `rawScore`); en ellas `threshold` y `modelVersion` son `null` (no se conocían). Las filas nuevas traen todo.

## POST /mammography-analyses

Request (JSON):

```json
{ "appointmentFileId": "df6d243f-e3c4-4479-86ad-26a856dbcf69", "notes": "smoke fase 3 (2)" }
```

Opcionales conservados: `appointmentId`, `patientId` (si se envían deben coincidir con los del archivo, si no 400) y `sourceFileName` (por defecto, el nombre original del archivo). `notes` máx. 2000.

Respuesta real (201):

```json
{
  "code": 201,
  "data": {
    "id": "95caec03-5c01-49a4-8e5a-501d56ac1aab",
    "appointmentId": "4a1142e2-1f41-4b88-9107-e54285e82296",
    "appointmentFileId": "df6d243f-e3c4-4479-86ad-26a856dbcf69",
    "patientId": "41841702-db50-43fb-91df-4a373608677d",
    "analyzedBy": "a1000000-0000-4000-8000-000000000007",
    "prediction": "MALIGNANT",
    "probability": 96.19,
    "malignancyProbability": 96.19,
    "rawScore": 0.03811945021152496,
    "threshold": 0.15,
    "modelVersion": "sha256:ae32a857672b",
    "status": "danger",
    "label": "Neoplasia Maligna (BI-RADS 4/5)",
    "notes": "smoke fase 3 (2)",
    "isReviewed": false,
    "reviewedBy": null,
    "reviewedAt": null,
    "reviewNotes": null,
    "sourceFileName": "photo_2026-06-12_14-38-13.jpg",
    "imageUrl": "http://localhost:8008/mammography-analyses/95caec03-5c01-49a4-8e5a-501d56ac1aab/image",
    "createdAt": "2026-09-27T03:31:18.057Z"
  }
}
```

Un benigno real del smoke: `"prediction": "BENIGN", "probability": 35.6, "malignancyProbability": 64.4, "rawScore": 0.3559747040271759, "status": "success"`.

Si el archivo es DICOM, el backend lo convierte a JPEG (primer frame) antes del detector y `imageUrl` sirve ese JPEG.

## POST /mammography-analyses/preview

Multipart, campo `file` (PNG/JPEG/WEBP o DICOM, máx. 20 MB). No guarda nada. Respuesta real (201):

```json
{
  "code": 201,
  "data": {
    "prediction": "MALIGNANT",
    "probability": 96.1880549788475,
    "malignancyProbability": 96.1880549788475,
    "rawScore": 0.03811945021152496,
    "threshold": 0.15,
    "modelVersion": "sha256:ae32a857672b",
    "status": "danger",
    "label": "Neoplasia Maligna (BI-RADS 4/5)"
  }
}
```

La vista previa devuelve la precisión completa; el análisis guardado redondea `probability` y `malignancyProbability` a 2 decimales. Un DICOM de más de 20 MB: convertirlo con `/files/dicom-convert` y enviar el JPEG del frame.

## GET /mammography-analyses/stats/daily

```json
{ "code": 200, "data": { "dateFrom": "2026-01-01", "dateTo": "2026-12-31", "total": 27, "danger": 6, "pending": 10, "highRisk": 6 } }
```

## Errores

| Status | Cuándo | `error` |
|---|---|---|
| 400 | Campo del modelo en el cuerpo | `["prediction lo calcula el servidor con el modelo; no se acepta en el cuerpo.", ...]` (lista) |
| 400 | `appointmentFileId` ausente o no UUID | `["appointmentFileId debe ser un UUID válido."]` |
| 400 | `appointmentId`/`patientId` no coinciden con el archivo | `appointmentId no corresponde al archivo indicado.` |
| 400 | Preview sin archivo | `Debe enviar un archivo de imagen en el campo "file".` |
| 400 | Imagen dañada (detector) | `La imagen está dañada o no se puede leer.` |
| 403 | Médico con archivo de una cita ajena | `No tiene acceso a este archivo.` |
| 404 | Archivo de cita inexistente / borrado | `El archivo de mamografía indicado no existe.` |
| 404 | El archivo no está en disco | `El archivo de imagen no existe en el servidor.` |
| 413 | Subida por encima del tope (preview 20 MB, appointment-upload raster 20 MB / DICOM 100 MB) | `El archivo supera el tamaño máximo permitido (20 MB).` |
| 413 | El detector rechaza por tamaño | `La imagen supera el tamaño máximo permitido para el análisis (20 MB).` |
| 415 | Formato no soportado por el detector | `Formato de archivo no soportado para el análisis.` |
| 422 | Imagen fuera de dominio (p. ej. gris uniforme) | `La imagen no parece una mamografía válida para el modelo.` |
| 503 | Detector caído, sin modelo, timeout (30 s) o respuesta inválida | `El servicio de análisis no está disponible.` |

Ningún error expone detalles internos del detector.

## Checklist de migración

- [ ] Consulta: tras `finish-consultation`, subir cada mamografía con `/files/appointment-upload` y llamar `POST /mammography-analyses` con `{ appointmentFileId, notes }` (el acuerdo/comentario del médico va en `notes`; ya no hay `rawResponse`).
- [ ] Vista previa en la consulta y detector independiente: `POST /mammography-analyses/preview`.
- [ ] Borrar la llamada directa a `:8009/predict` y la normalización de `ml.service` (M-46).
- [ ] Etiquetas: `malignancyProbability` = probabilidad de malignidad; `probability` = confianza en la clase.
- [ ] Filtro `minProbability` rotulado como probabilidad de malignidad.
- [ ] Manejar 413/415/422/503 con los mensajes del backend.
- [ ] "Guardar en Registro" del detector independiente: no hay endpoint para guardar sin archivo de cita (se retira o se conecta a un flujo con cita).
