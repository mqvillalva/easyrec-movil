# EasyRec para celular — diseño (aprobado por Mateo el 2026-10-26)

## Qué es
Una página web (HTML/CSS/JS sin compiladores) que graba con el micrófono del celular, para iPhone (Safari)
y Android (Chrome). Misma estética, ícono y nombre ("EasyRec") que la app de compu (`~/Claude/EasyRec`).
Se publica en GitHub Pages desde un repo público aparte (`easyrec-movil`). Las grabaciones nunca se suben: quedan en el celu.

## Decisiones de Mateo
- iPhone y Android. Solo el micrófono del celu (un archivo por grabación, mono).
- Funciones: pausa, marcas 🚩 (en un .txt aparte), medidor (rayita en −12 dB y cartel MUY FUERTE), lista de grabaciones.
- Formato elegible como en la compu: WAV (24 bits/48 kHz, marcado de entrada), MP3 (320 kbps) o los dos.
- Publicación: GitHub Pages, repo nuevo público.
- [decidido por Claude, aprobado con el diseño] nombre "EasyRec"; "Borrar" pide confirmación.

## Pantalla (una sola, vertical)
1. Arriba: logo + "EasyRec". Si el micrófono todavía no está activado: botón grande "Activar micrófono"
   (en iPhone el navegador solo deja pedir el micrófono después de un toque).
2. Nombre de la grabación (ya escrito con fecha y hora, editable) y formato (WAV / MP3 / Los dos).
3. Medidor grande (−60 a 0 dB, rayita en −12, cartel MUY FUERTE).
4. Tiempo, estado y botones grandes: Grabar, Pausa, 🚩 Marca, Detener.
5. Aviso fijo mientras graba: "No bloquees el celu ni cambies de app".
6. Lista: nombre, fecha, duración, marcas, estado ("se cortó" si corresponde). Por cada archivo: Escuchar y
   Guardar/Compartir. Por grabación: Borrar (con confirmación). Arriba de la lista: espacio libre aproximado.

## Cómo graba
- `getUserMedia` sin cancelación de eco, sin supresión de ruido, sin volumen automático. AudioContext a 48 kHz.
  AudioWorklet copia el audio (igual que en la compu) y lo manda a un hilo aparte (Web Worker).
- El Worker escribe MIENTRAS se graba en el almacenamiento privado del navegador (OPFS, "Origin Private File System":
  archivos de verdad dentro del celu, sin pasar todo por la memoria):
  - WAV mono 24 bits con el encabezado actualizado cada 1 s (mismo método que `EasyRec/electron/writers.mjs`).
  - MP3 mono 320 kbps con lamejs (@breezystack/lamejs, LGPL), cuadros independientes.
  - Marcas en un .txt que se reescribe en cada marca.
- Cada grabación en su carpeta (por id) dentro de OPFS; la lista (nombre, fecha, duración, estado, marcas) en localStorage.
- Pantalla prendida mientras graba (Screen Wake Lock). Si la página queda oculta (bloqueo, otra app, llamada):
  la grabación pasa sola a PAUSA (lo grabado queda a salvo) y al volver aparece un aviso para seguir.
- Si se cierra el navegador o se apaga el celu grabando: al abrir, esa grabación queda "se cortó" con lo que se
  alcanzó a guardar (largo calculado por el tamaño del WAV, o del MP3 si solo hay MP3).
- Se pide almacenamiento persistente (`navigator.storage.persist()`) para que el navegador no borre las grabaciones.

## Sacar los archivos
- Guardar/Compartir: `navigator.share({ files })` (menú del celu: Archivos, Drive, WhatsApp, mail…).
  Si el navegador no lo permite: descarga normal. Nombres: `<Nombre>.wav`, `<Nombre>.mp3`, `<Nombre> - Marcas.txt`.
- Aviso en la guía: en iPhone, Safari puede borrar los datos de páginas que no se usan por 7 días si no está
  agregada a la pantalla de inicio → guardar/compartir siempre después de grabar.

## Instalable
- `manifest.webmanifest` + íconos (los de EasyRec) → "Agregar a pantalla de inicio", abre a pantalla completa.
- Sin funcionamiento sin conexión por ahora (no se pidió).

## Pruebas
- `npm test`: escritores WAV/MP3 (funciones puras, sin navegador).
- Prueba de la página real con micrófono simulado en la Mac (Electron, igual que EasyRec): activar, grabar, marca,
  pausa automática al ocultar, detener, archivos correctos, recuperación de grabación cortada, borrar.
- Mateo la prueba en un iPhone y en un Android una vez publicada (hace falta https para el micrófono).

## Errores que se muestran en palabras simples
- Permiso de micrófono negado → cómo habilitarlo (iPhone / Android).
- Navegador viejo sin OPFS/AudioWorklet → "Actualizá el navegador".
- Poco espacio → aviso antes de grabar con los minutos aproximados que entran.
