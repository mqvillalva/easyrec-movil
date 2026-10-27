# EasyRec para celular — grabadora web (entrevistas y podcasts)

## Con quién trabajo
- Mateo, músico (no programa). Castellano rioplatense, sin jerga; explicar términos técnicos la primera vez. Ser conciso.
- Preguntar SIEMPRE antes de decidir algo suyo (aspecto, nombres, funciones). Se pueden juntar preguntas.
- Lo que tenga que hacer él: pasos numerados. Solo herramientas gratuitas; avisar antes si algo tiene costo o límites.
- Commit al terminar cada etapa. Mantener este archivo actualizado.
- Hermana de EasyRec de compu (`~/Claude/EasyRec`, Electron para Windows): misma estética, ícono y formatos.

## Cómo se trabaja
- En la Mac de Mateo (MacBook Pro 2020 Intel, macOS 26, Node 24), carpeta `~/Claude/easyrec-movil`, git local.
- Se publica en GitHub Pages desde un repo PÚBLICO aparte: `mqvillalva/easyrec-movil` → https://mqvillalva.github.io/easyrec-movil/
  (Pages es gratis solo en repos públicos). Publicar = `git push` a `main`; se actualiza en ~1 min. `gh` instalado con brew,
  sesión de Mateo iniciada (2026-10-26).
  El micrófono solo anda con https (o en http://localhost para probar en la compu).
- Probar: `npm test` (WAV/MP3/textos, sin navegador) y `npm run smoke` (la página real en Electron con micrófono
  simulado y ventana de celular; `SHOT=archivo.png` guarda capturas). `npm run serve` la sirve en http://localhost:8080.
- Con npm 11, `npm install` no baja Electron solo: correr `node node_modules/electron/install.js` después.

## Tecnología
- HTML/CSS/JS sin compiladores, archivos estáticos. Diseño completo en `docs/diseno.md`, plan en `docs/plan.md`.
- `app.js` pantalla · `audio-input.js` micrófono sin procesamiento a 48 kHz mono, medidor, captura (AudioWorklet
  `capture-worklet.js`, copia del de EasyRec); reabre el micrófono si el sistema lo cortó.
- `rec-worker.js` (hilo aparte) escribe MIENTRAS se graba en OPFS (almacenamiento privado del navegador):
  `rec/<id>/audio.wav` (24 bits, encabezado actualizado cada 1 s), `audio.mp3` (320 kbps, lamejs en `vendor/`), `marcas.txt`.
  Todos los métodos del sync access handle van con await (Safari viejo devolvía promesas).
- `store.js`: lista en localStorage (`easyrec.grabaciones`), archivos para escuchar/compartir con su nombre final
  (`<Nombre>.wav`, `<Nombre>.mp3`, `<Nombre> - Marcas.txt`), recuperación de cortadas, borrar, lugar libre.
- `encoders.js`: piezas puras (encabezado WAV, 24 bits, MP3, tiempos, texto de marcas, nombres) — con pruebas.
- Compartir: `navigator.share({ files })`; si no se puede, descarga. Los File se preparan al dibujar la lista porque en
  iPhone el menú de compartir tiene que abrirse enseguida después del toque.
- Instalable: `manifest.webmanifest`, `icons/` (salen de `EasyRec/build/icon.png` con `sips`).
- `window.__easyrec` = para pruebas.

## Decisiones de Mateo
- iPhone y Android. Solo el micrófono del celu. Pausa, marcas 🚩 (.txt), medidor (−12 dB, MUY FUERTE), lista.
- Formato elegible como en la compu (WAV por defecto, MP3 320 o los dos). Publicar en GitHub Pages, repo público aparte.
- Aprobado con el diseño: nombre "EasyRec"; Borrar pide confirmación.
- [decidido por Claude, confirmar] si la página queda oculta (bloqueo, otra app, llamada) se pausa sola y al volver avisa;
  pantalla prendida mientras graba; aviso de poco lugar si entran menos de 10 minutos.

## Estado
- [x] 1. Página completa, probada en la Mac con micrófono simulado (todo bien).
- [x] 2. Publicada en GitHub Pages (2026-10-26).
- [ ] 3. Prueba de Mateo en un iPhone y en un Android.
