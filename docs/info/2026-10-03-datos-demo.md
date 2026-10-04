# Datos de demostración — base de datos local de pruebas

> Fecha: 2026-10-03 · Script: `scripts/seed-demo.js` · Base: `bd_gestion_medica` local (datos de prueba).
> Contraseña de **todos** los usuarios (nuevos y existentes, incluido el usuario de sistema `admin`): **`Abc123456.`** (con el punto final). Es solo para la demostración.

## 1. Qué se creó

Todo se creó a través de la API real (validaciones, secuencias `APT`/`PAC`/`CONS`/`REC`, permisos e invalidación de caché incluidos). Solo se usó SQL directo para lo que la API no permite (ver §4).

| Elemento | Cantidad | Detalle |
|---|---|---|
| Centros médicos | 4 | Centro Clínico Ávila (Caracas), Policlínica Los Próceres (Caracas), Unidad Médica Guaparo (Valencia), Centro de Salud Integral del Lago (Maracaibo) |
| Departamentos | 14 | En todos los centros: **Mastología** y **Radiología y Mamografía**. Además: Ginecología (Ávila, Guaparo), Oncología (Ávila), Medicina General (Ávila, Próceres, Lago) |
| Especialidades | 0 nuevas | Se reutilizan MS, RAD, GO, ONCO y MG. Se corrigió el nombre `mastología` → `Mastología` |
| Médicos | 14 | 5 mastólogos, 4 radiólogos, 2 ginecólogas, 1 oncólogo, 2 de medicina general; cada uno con su centro, departamento, especialidad y horario semanal (69 bloques) |
| Personal | 5 | 3 enfermeros y 2 administradores (rol `superusuario`), asignados a centros (`users_medical_centers`) |
| Pacientes | 110 | Cédulas V- (y E- para extranjeros), teléfonos +58, correo en el 85 %; 35 con alergias y 41 con enfermedades crónicas |
| Citas | 279 | 202 completadas (2026-05-20 → hoy), 13 canceladas, 35 confirmadas y 29 pendientes (2026-10-06 → 2026-11-14) |
| Historias clínicas | 202 | Una por cita completada, con signos vitales, diagnóstico CIE-10, plan y observaciones |
| Recetas | 151 | 170 ítems con cantidad; 83 dispensadas, el resto activas |
| Análisis de mamografía | 63 | Sobre 53 citas (algunas con proyecciones CC y MLO). Ver §3 |

Los 110 pacientes tienen al menos una cita. Los 3 pacientes de QA anteriores que no tenían citas se eliminaron con `--clean-junk` (§5): ya no queda ningún paciente activo sin cita.

**Limitación del modelo de datos:** `persona_comun` no tiene fecha de nacimiento ni sexo. La edad (25–75 años) solo se refleja en el número de cédula, la ocupación y el estado civil, y el sexo en el nombre.

## 2. Cuentas de demostración

Contraseña de todas: `Abc123456.` · Login con `credential` = usuario o correo.

| Usuario | Correo | Rol | Centro(s) | Perfil |
|---|---|---|---|---|
| `cmendoza` | cmendoza@medos-demo.example.com | medico | Centro Clínico Ávila | **Dra. Carolina Mendoza, mastóloga principal de la demo** (L–V 08–16, sáb. 08–12) |
| `lgutierrez` | lgutierrez@medos-demo.example.com | medico | Centro Clínico Ávila | Radióloga (L–V 08–14, sáb. 08–12) |
| `rparedes` | rparedes@medos-demo.example.com | medico | Centro Clínico Ávila | Mastólogo |
| `mfigueroa` | mfigueroa@medos-demo.example.com | medico | Centro Clínico Ávila | Ginecóloga |
| `jcastillo` | jcastillo@medos-demo.example.com | medico | Centro Clínico Ávila | Oncólogo |
| `arodriguez` | arodriguez@medos-demo.example.com | medico | Centro Clínico Ávila | Medicina general |
| `fmarquez` | fmarquez@medos-demo.example.com | medico | Policlínica Los Próceres | Mastólogo |
| `vherrera` | vherrera@medos-demo.example.com | medico | Policlínica Los Próceres | Radióloga |
| `pacosta` | pacosta@medos-demo.example.com | medico | Policlínica Los Próceres | Medicina general |
| `gsilva` | gsilva@medos-demo.example.com | medico | Unidad Médica Guaparo | Mastóloga |
| `nperez` | nperez@medos-demo.example.com | medico | Unidad Médica Guaparo | Ginecóloga |
| `ezambrano` | ezambrano@medos-demo.example.com | medico | Unidad Médica Guaparo | Radiólogo |
| `aurdaneta` | aurdaneta@medos-demo.example.com | medico | Centro de Salud Integral del Lago | Mastólogo |
| `mchourio` | mchourio@medos-demo.example.com | medico | Centro de Salud Integral del Lago | Radióloga |
| `enf.ramirez` | enframirez@medos-demo.example.com | enfermero | Centro Clínico Ávila | Enfermera |
| `enf.torres` | enftorres@medos-demo.example.com | enfermero | Policlínica Los Próceres | Enfermero |
| `enf.gonzalez` | enfgonzalez@medos-demo.example.com | enfermero | Guaparo y del Lago | Enfermera |
| `admin.caracas` | admincaracas@medos-demo.example.com | superusuario | Ávila y Los Próceres | Administradora |
| `admin.regional` | adminregional@medos-demo.example.com | superusuario | Guaparo y del Lago | Administrador |

No existe un rol "administrativo" distinto: los administradores usan `superusuario`, que ve todos los centros. El rol `enfermero` existente solo tiene `patient.consultar` y `patient.crear`; no se modificaron permisos.

Las cuentas previas (`qa_super_clean`, `gabriel`, `julio`, `daniel`, `qa_enfermero`, etc.) siguen existiendo, ahora con la misma contraseña.

## 3. Análisis de mamografía: cómo se generaron

Cada análisis es una **salida real del detector** producida por el flujo del servidor: `POST /files/appointment-upload` con la imagen y luego `POST /mammography-analyses { appointmentFileId }` con el token del médico de la cita. Ningún resultado se escribió a mano.

- **Imágenes de origen:** las 4 mamografías reales que ya estaban en el volumen `uploads` del backend (puntuación cruda del modelo 0,0079, 0,0381, 0,3560 y 0,9997).
- **Variantes:** el script genera 180 variantes leves y deterministas de esas 4 imágenes con `sharp`: brillo y contraste (±15 %), recorte de 2–9 %, borde negro de hasta 5 %, espejo horizontal y rotación de ±5°. Se generan dentro del contenedor, en memoria; no se versionan ni salen de la máquina.
- **Guardia de dominio:** las 180 variantes pasaron (0 rechazadas con 422), y en el flujo real tampoco hubo rechazos.
- **Pre-selección:** antes de subir nada, el script pasa cada variante por el detector para conocer su clase y así lograr la mezcla deseada. El modelo es determinista: los 63 análisis guardados coinciden con la pre-selección (0 diferencias en `rawScore`).
- **Mezcla resultante (63 análisis):** 49 benignos y 14 malignos. Incluye 14 casos limítrofes: 7 malignos con puntuación cruda entre 0,08 y 0,15 y 7 benignos entre 0,15 y 0,30. El rango cubierto va de 0,0047 a 0,9997.
- **Revisión médica:** 46 revisados (`PATCH /mammography-analyses/:id/review`) y 17 pendientes. De los revisados, 7 tienen una nota de desacuerdo con el modelo. 20 llevan además una nota del médico al crearlos (`Médico: Confirma resultado | Nota: …`, el formato del frontend).
- **Hoy (2026-10-03):** 11 análisis. La bandeja de `cmendoza` muestra 5 citas y 6 análisis, 5 de ellos pendientes.

El total (63) supera en 3 el tope previsto de 60: una primera ejecución se cortó a mitad y dejó 5 análisis que el reintento no reemplazó. Una ejecución sobre una base limpia produce unos 58.

> Observación para la tesis: variaciones visuales leves de una misma mamografía mueven la puntuación del modelo de un extremo al otro (p. ej., variantes de la imagen benigna 0,9997 llegaron a 0,002). Por eso los 63 resultados son reales pero vienen de solo 4 estudios: no sirven como evaluación del modelo.

## 4. SQL directo y caché

La API no permite crear citas en el pasado. Para las citas pasadas, el script crea la cita el mismo día de la semana y a la misma hora, pero varias semanas en el futuro (≥ 70 días). Después cierra la consulta, sube las imágenes, analiza y revisa por la API, y al final mueve la cita a su fecha real con SQL. Como se desplaza un número entero de semanas, la cita siempre cae dentro del horario del médico.

| Qué | Por qué |
|---|---|
| `users.password` y `seguridad.users.password` → bcrypt (costo 10, igual que `user.service.ts`) de `Abc123456.` | Unificar la contraseña de los usuarios existentes. Solo se actualiza si el hash actual no corresponde |
| `appointment_date`, `created_at`, `updated_at` de citas pasadas | Llevarlas a su fecha real |
| `created_at`/`updated_at` de historias, archivos y análisis; `issue_date`/`expiry_date` de recetas; `reviewed_at` de análisis | Que coincidan con la fecha de la consulta |
| `patients.created_at` / `persona_comun.created_at` | Registro unos días antes de la primera reserva (desde 2026-04-28) |
| `APT-2026-00031` (fixture de QA): fecha −21 días | Era una cita **completada** con fecha futura (20/10) |

Al terminar, el script borra todas las claves de caché de Redis **excepto** `session:*` y `bull:*`.

## 5. Cómo volver a ejecutarlo

El script corre **dentro** del contenedor `medos-backend`, porque necesita las variables de BD, Redis y detector y el volumen `uploads`. Desde la carpeta del repositorio:

```bash
docker cp scripts/seed-demo.js medos-backend:/tmp/seed-demo.js
docker exec -w /app -e NODE_PATH=/app/node_modules medos-backend node /tmp/seed-demo.js           # completo
docker exec -w /app -e NODE_PATH=/app/node_modules medos-backend node /tmp/seed-demo.js --today   # solo la agenda de hoy
docker exec -w /app -e NODE_PATH=/app/node_modules medos-backend node /tmp/seed-demo.js --clean-junk   # limpia datos de prueba antiguos
```

- **Idempotente:** centros, departamentos, médicos, personal y pacientes se buscan por nombre, usuario o documento antes de crearse. El historial de citas solo se genera para pacientes de la demo que no tienen ninguna cita. Una segunda ejecución no crea nada (verificado: 1 petición, 0 altas).
- **Agenda de hoy:** si `cmendoza` y `lgutierrez` no tienen citas hoy y trabajan ese día (L–S), el script crea su agenda. Las horas ya pasadas quedan completadas con mamografías pendientes en la bandeja; las horas futuras quedan confirmadas o pendientes. **Ejecutarlo con `--today` la mañana de la presentación** (la bandeja y `stats/daily` muestran el día actual). Cada ejecución en un día nuevo agrega unos 11 análisis.
- **Duración:** unos 10 minutos en una base vacía. El script respeta el limitador global de la API (100 peticiones/min por IP) y, si recibe un 429, espera y reintenta.
- **Recuperación:** si una ejecución se corta entre la API y el SQL, la siguiente corrige las fechas de los registros dependientes (paso `repair`).
- **Limpieza (`--clean-junk`, ya aplicada el 2026-10-03):** borrado lógico por la API de los usuarios `alasdoasd`, `asdasdasd`, `marco` y `royfran` y de sus médicos, del médico sin usuario "asdasda asdasdasdasd" (licencia 6546846) y de los pacientes de QA sin citas `PAC-2026-00002`, `PAC-2026-00003` y `QA-M18-002`. Solo se borra lo que no tiene citas. También renombra por la API las personas de `mario` y `ysleidy` (que tenían nombres de relleno), corrige el nombre, la dirección y el teléfono de los centros antiguos (p. ej. "santa ines" → "Centro Médico Santa Inés") y acentúa los nombres de los departamentos antiguos. Los usuarios de QA (`mario`, `julio`, `daniel`, `qa*`) se conservan. Re-ejecutarlo no cambia nada.
- Variables opcionales: `SEED_API_URL` (por defecto `http://localhost:$PORT`) y `SEED_ADMIN` (usuario con el que se crean los datos; por defecto `qa_super_clean`).

## 6. Recorrido sugerido para la demo

1. **Administración:** iniciar sesión con `admin.caracas`. Dashboard con 314 citas, 114 pacientes y 8 centros; centros con sus departamentos y médicos; lista de pacientes.
2. **Agenda de la mastóloga:** iniciar sesión con `cmendoza`. El dashboard muestra sus 45 citas, 33 completadas y la agenda del día.
3. **Consulta → mamografía:** abrir una cita confirmada o pendiente de `cmendoza` (después de `--today`, una de las horas futuras de hoy; si no, una de las próximas confirmadas en Centro Clínico Ávila) → finalizar la consulta → pestaña de mamografía (departamento *Mastología*) → subir una imagen → ver la predicción.
4. **Bandeja de revisión:** en *Análisis IA*, ver la bandeja del día. Hoy tiene 5 citas pendientes y un maligno al tope (Coromoto Bastidas, V-22888766, malignidad 99,5 %). Revisar un análisis con nota de acuerdo o desacuerdo.
5. **Historia de una paciente con hallazgo maligno:** Andrea Pacheco (V-8378923) o Verónica Hernández (V-14567103), con varias citas, análisis revisados y recetas.
6. **Otros roles:** `enf.ramirez` (solo pacientes) y `lgutierrez` (radióloga, 5 análisis hoy).

## 7. Lo que no se hizo o hay que saber

- **Horarios (corregido en `4b9c21f`):** ahora se puede reservar el primer turno de cada bloque. La cita debe caber completa en el bloque: puede terminar justo a la hora de cierre, pero no empezar a esa hora. El seed sigue empezando en inicio + 30 min, lo que no afecta a los datos.
- Las historias clínicas quedan con estado `in_progress`, igual que en el flujo real de `finish-consultation`.
- Se conservan los usuarios de prueba que los informes de QA usan (`mario`, `julio`, `daniel`, `gabriel`, `qa*`) y sus citas antiguas.
