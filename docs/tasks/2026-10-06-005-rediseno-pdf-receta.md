# 2026-10-06-005 — Rediseño del PDF de receta según el mockup de Stitch

## Qué se pidió

Rehacer el PDF de receta (`src/documents/recipe-pdf.builder.ts`, pdfmake) para que se parezca al mockup hecho en Stitch:
banda superior en degradado, marca de agua con el emblema médico, cabecera con píldoras (documento oficial, NRO), datos del
centro a la derecha, tarjetas redondeadas de paciente / médico / diagnóstico, tabla de prescripción redondeada con cabecera
gris, tarjeta de notas con barra lateral, firma + sello reales a la izquierda y tarjeta de verificación con QR a la derecha,
pie con fecha de impresión, ID corto y centro.

Restricciones previas que se mantienen aunque el mockup muestre otra cosa:

- Nunca imprimir el código ni la URL de verificación como texto: solo QR + enlace enmascarado.
- `ID Gestión` con los primeros 8 caracteres del uuid.
- No inventar datos: todo lo que se imprime sale de la receta, el médico, el paciente o el centro.
- Colores acordes al frontend; `LAYOUT_VERSION` sube para regenerar los PDF cacheados.

## Qué se hizo

| Archivo | Cambio |
|---|---|
| `src/documents/recipe-pdf.builder.ts` | Nuevo diseño completo. `RecipePdfData` suma `sex`, `doctor.licenseNumber`, `medicalCenter.phone`, `items[].route`; el fingerprint los incluye; `LAYOUT_VERSION` 2 → 3. `VERIFY_LEGEND` / `VERIFY_HINT` / `VERIFY_LINK_TEXT` con el texto nuevo |
| `src/documents/recipe-pdf.frames.ts` (nuevo) | Tarjetas redondeadas: marcadores, medición en una primera pasada de pdfmake y dibujo del marco en la segunda (`renderFramedPdf`) |
| `src/documents/recipe-pdf.parts.ts` (nuevo) | Fuentes, layouts de tabla con nombre, píldora, tile de ícono, tarjeta, título de sección, tamaño real del QR |
| `src/documents/recipe-pdf.theme.ts` (nuevo) | Paleta, íconos SVG, marca de agua (vara de Asclepio), medición de texto con las métricas de pdfkit |
| `src/documents/recipe-pdf.builder.spec.ts` | Ajustes al nuevo árbol + 6 tests nuevos |
| `src/documents/recipe-pdf-credentials.spec.ts` | Enlace enmascarado con el texto y color nuevos |

`recipe-pdf.service.ts` no cambió: `loadRecipe` ya trae `commonPerson` (con `sex`), el `Doctor` completo (con
`licenseNumber`), el `MedicalCenter` completo (con `phone`) y los items (con `route`). Solo faltaba tiparlos e imprimirlos.

## Decisiones

| Decisión | Razón |
|---|---|
| Tarjetas redondeadas con dos pasadas de layout | pdfmake no tiene `border-radius` en tablas ni fondos para un `stack`. La primera pasada (`pageBreakBefore`) registra la posición de marcadores invisibles al inicio y al final de cada grupo; la segunda dibuja un `rect` con `r` en posición absoluta con la altura medida. El costo es renderizar dos veces (~0,4 s por PDF en local) |
| El marco va en `absolutePosition`, no en `relativePosition` | pdfmake rechaza un canvas relativo más alto que el espacio restante de la página y lo manda a la página siguiente (eso generaba una segunda página en blanco con el marco del QR) |
| Grupos que no caben se pasan enteros a la página siguiente si miden menos del 55 % de la página | Evita tarjetas partidas. Una tabla más larga sí se parte; en ese caso pierde el marco redondeado y usa un layout cuadrado de respaldo (`recipeItemsFallback` / `recipeCardFallback`) con cabecera repetida |
| Firma y QR empujados al pie de la página | Como en el mockup. Si el bloque abre una página nueva no se empuja, para no dejar media página vacía arriba |
| Firma y sello lado a lado, nunca superpuestos | En el mockup se pisaban con el nombre del médico. Se mantiene la lógica real de imágenes (`DoctorCredentialsService.dataUrls`) |
| Degradado de la banda con `linearGradient` del canvas de pdfmake | Soportado nativamente por `rect`; no hizo falta SVG |
| Íconos y marca de agua en SVG | pdfmake 0.3.11 trae svg-to-pdfkit. No hay Font Awesome; los íconos son trazos propios simples |
| Marca de agua al 2,5 % de opacidad, `slate-900` | Lo pedido; con 3 % ya competía con el texto de las notas |
| Helvetica (fuente estándar del PDF), sin Inter | El repo no tiene los TTF de Inter en ninguna dependencia. Agregarlos implica bajar archivos y copiarlos en el build; se dejó la fuente actual. Courier solo para el número de receta (estilo monoespaciado del mockup) |
| Colores: teal de Tailwind como acento principal, `primary` del frontend para el médico, `emerald-custom` al final del degradado | El frontend (`tailwind.config.js`) define `primary: #4f44e9` (≈ indigo-600, el índigo del mockup) y `emerald-custom: #10b981`; no usa teal. Se respetó el teal del mockup como acento clínico y se tomaron del frontend el índigo y el esmeralda exactos; los neutros son la escala slate que usa toda la app |
| Ruta de administración: "Rp. Vía X" en la cabecera solo si todos los items comparten la misma; si no, "Vía X" junto a cada medicamento | `route` es por item, no por receta |
| Frecuencia en píldora solo si cabe en la columna | Una frecuencia larga ("cada 8 horas si hay fiebre") se imprime como texto teal para no desbordar |
| Licencia como "Licencia: X" | `doctors.license_number` es un único campo genérico; no se puede afirmar que sea MPPS ni que exista número de colegio |
| Tamaño real del QR con el codificador interno de pdfmake | pdfmake redondea el tamaño del módulo hacia abajo y el QR sale más chico que `fit`; sin el tamaño real no se puede centrar en su recuadro. Si la ruta interna cambia en otra versión, cae a `fit` y solo pierde el centrado |

## Elementos del mockup omitidos por falta de datos

| Elemento | Motivo |
|---|---|
| RIF del centro | `medical_centers` no tiene RIF. Se imprime solo el teléfono (`phone`) cuando existe |
| Número de colegio de médicos | No existe en `doctors` |
| "MPPS" como etiqueta | El campo es `license_number` genérico; se imprime como "Licencia" |
| Badge "Evaluación de control clínico" | No hay campo que lo respalde |
| Unidad "mg" u otras en la cantidad | Se imprime `unit` solo si el item la tiene |
| Valores del mockup (`J-30495811-0`, `84.192`, `REC-2026-00150`) | Nunca se escriben en código; hay un test que lo verifica |

## Verificación

- `npm run build`: 0 errores.
- `npx jest --runInBand`: **96 suites, 783 tests, todos verdes** (baseline anterior 96 / 777; +6 tests).
- Tests nuevos (todos llaman al builder real o a `renderPdf`): receta típica en 1 página (cuenta de páginas del PDF
  real), receta de 18 items en más de una página sin romper, sexo / licencia / teléfono / ruta solo cuando existen, rutas
  mixtas junto a cada item, ningún valor del mockup impreso, pie con fecha, ID de 8 caracteres y centro, y el fingerprint
  cambia con cada campo nuevo. Siguen verdes los de "ni la URL ni el código se imprimen como texto" y el enlace
  (`/URI (...)`) al URL de verificación en el PDF renderizado.
- Lint: los 3 archivos nuevos no agregan errores; en el builder queda solo el `no-base-to-string` del helper `text()`
  que ya existía.
- Render visual con el builder real (script en el scratchpad, datos realistas, firma y sello generados con sharp porque
  los del contenedor `medos-backend` son imágenes de prueba de una línea) convertido a PNG con pypdfium2:
  receta de 2 items (1 página), 6 items con nombres largos (2 páginas: la firma pasa entera a la segunda) y 18 items con
  centro y especialidad largos (tabla partida con layout de respaldo). Sin solapes ni desbordes.

## Fuera de alcance / pendiente

- Inter: si se quiere, agregar los TTF (OFL) bajo `src/assets/fonts`, copiarlos en `nest-cli.json` y registrarlos en
  `pdfmake.setFonts` ampliando `setLocalAccessPolicy` a esas rutas.
- "FIRMA Y SELLO MÉDICO DIGITAL" se dejó como pidió el mockup, pero es la imagen escaneada de la firma, no una firma
  digital criptográfica. Si el texto puede leerse como una afirmación legal, conviene volver a "FIRMA Y SELLO MÉDICO".
- La tabla partida en dos páginas pierde las esquinas redondeadas (usa el layout cuadrado de respaldo).
- Renderizar dos veces duplica el costo de CPU de cada PDF no cacheado; el caché por fingerprint sigue evitando
  regenerar.
