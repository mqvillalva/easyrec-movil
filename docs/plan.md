# EasyRec para celular — plan de trabajo

> Se ejecuta en esta misma sesión, tarea por tarea, con prueba y commit al final de cada una.

**Objetivo:** página web instalable que graba con el micrófono del celu (iPhone/Android) en WAV y/o MP3, con pausa, marcas, medidor y lista.
**Arquitectura:** HTML/CSS/JS sin compiladores. La pantalla (`app.js`) toma el audio con un AudioWorklet y lo pasa a un
Web Worker (`rec-worker.js`) que escribe los archivos en OPFS mientras se graba. La lista vive en localStorage (`store.js`).
**Tecnología:** Web Audio, OPFS (sync access handles), Screen Wake Lock, Web Share, lamejs. Pruebas: `node --test` y Electron con micrófono simulado.
**Diseño:** `docs/diseno.md`

## Restricciones generales
- Nada de compiladores ni frameworks. Todo funciona servido como archivos estáticos (GitHub Pages).
- 48 kHz, WAV mono 24 bits, MP3 mono 320 kbps. Marcas con el tiempo grabado (sin contar pausas), formato igual a la app de compu.
- Navegadores: Safari iOS 16.4+ y Chrome Android reciente. Todos los métodos del sync access handle se usan con `await`
  (en Safari viejo devolvían promesas).
- Textos en castellano rioplatense, sin jerga. Estética de `EasyRec/src/styles.css`.

## Archivos
| Archivo | Para qué |
|---|---|
| `index.html`, `styles.css` | Pantalla única, vertical |
| `app.js` | Pantalla: estados, botones, lista, compartir, avisos |
| `audio-input.js` | Micrófono sin procesamiento, medidor, captura (reabre si el sistema cortó el mic) |
| `capture-worklet.js` | Copia del de EasyRec |
| `encoders.js` | Puro: `wavHeader`, `floatTo24`, `Mp3Stream`, `fmtTime`, `markersText`, `safeName`, `defaultName` |
| `rec-worker.js` | Escribe en OPFS: start / data / markers / stop / repair |
| `store.js` | Lista en localStorage, archivos de OPFS, recuperación de cortadas, borrar, espacio libre |
| `vendor/lamejs.js` | Copia de `@breezystack/lamejs/dist/lamejs.js` (LGPL) |
| `manifest.webmanifest`, `icons/*` | Instalable con el ícono de EasyRec |
| `test/encoders.test.mjs` | Pruebas puras |
| `test/smoke.cjs`, `tools/serve.mjs` | Página real en Electron con mic simulado, servida por http://localhost |

## Tarea 1: codificadores y textos (TDD)
**Produce:** `wavHeader(sampleRate, dataBytes) → Uint8Array(44)`, `floatTo24(Float32Array) → Uint8Array`,
`class Mp3Stream(sampleRate, kbps=320) { encode(Float32Array) → Uint8Array; end() → Uint8Array }`,
`fmtTime(sec) → "HH:MM:SS"`, `markersText(name, secs[]) → string`, `safeName(s) → string`, `defaultName(date) → "AAAA-MM-DD HH.MM"`.
- [ ] Pruebas: encabezado RIFF/WAVE/fmt/data con tamaños correctos; 24 bits con -1, 0, 1 y recorte fuera de rango;
  MP3 de 1 s empieza con sincronía `0xFFFB` y dura ≈1 s a 320 kbps; textos de marcas igual a la app de compu; safeName quita `\/:*?"<>|`.
- [ ] Correr y ver que fallan → implementar → pasan → commit.

## Tarea 2: escritor en el Worker
**Consume:** Tarea 1. **Produce** (mensajes): `start {id, sampleRate, wav, mp3}` → crea `rec/<id>/audio.wav|audio.mp3`;
`data {samples}`; `markers {text}` → `rec/<id>/marcas.txt`; `stop` → responde `{type:'stopped', seconds}`;
`repair {id, sampleRate}` → corrige el encabezado de un WAV cortado y responde `{type:'repaired', id, seconds}`;
cualquier falla → `{type:'error', message}`. Encabezado WAV y `flush()` cada 48000 muestras.
- [ ] Se prueba en la Tarea 4 (necesita navegador). Commit.

## Tarea 3: pantalla, entrada de audio, lista
**Consume:** Tareas 1–2. `store.js`: `list()`, `upsert(rec)`, `remove(id)` (borra carpeta OPFS), `files(rec) → Promise<[{kind, file:File}]>`,
`recoverInterrupted(repairFn)`, `freeMinutes(format) → number|null`. `window.__easyrec` para pruebas: `{ addMarker, togglePause, state() }`.
- Activar micrófono con un toque; medidor −60..0 dB, rayita −12, MUY FUERTE (pico ≥ −1 dB).
- Grabar → nombre (prompt en la pantalla, ya escrito) → graba; Pausa; Marca; Detener.
- Página oculta grabando → pausa sola + aviso al volver. Wake Lock mientras hay grabación en curso.
- Lista: Escuchar / Guardar o compartir por archivo (Files preparados al dibujar la lista, para no perder el "toque" en Safari);
  Borrar con `confirm()`. Espacio libre arriba de la lista.
- Errores en palabras simples (permiso negado, navegador viejo, poco espacio).
- [ ] Commit.

## Tarea 4: prueba con micrófono simulado
- `tools/serve.mjs`: servidor estático mínimo en un puerto libre.
- `test/smoke.cjs` (Electron, `use-fake-device-for-media-stream`): activar, grabar en "Los dos", marca, pausa,
  simular página oculta, seguir, detener; leer los archivos desde OPFS dentro de la página y verificar encabezado WAV,
  duración WAV ≈ MP3, marcas.txt; recargar con una grabación "grabando" a medias → queda "se cortó" con encabezado corregido; borrar.
- [ ] Correr, arreglar lo que falle, captura de pantalla en tamaño celular. Commit.

## Tarea 5: instalable, licencias y documentación
- `manifest.webmanifest` (name EasyRec, display standalone, colores de la app), íconos 192/512 y apple-touch-icon desde `EasyRec/build/icon.png`.
- `LICENCIAS.md` (lamejs LGPL), `CLAUDE.md` del proyecto, README corto.
- [ ] Commit.

## Tarea 6: publicar (con Mateo)
- Pasos numerados para crear el repo público `easyrec-movil` y subirlo; activar GitHub Pages; probar en iPhone y Android.
