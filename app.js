// Pantalla de EasyRec para celular: activar el micrófono, grabar (con pausa y marcas) y la lista de grabaciones.
import { createAudioInput, SAMPLE_RATE } from './audio-input.js';
import { fmtTime, markersText, defaultName } from './encoders.js';
import * as store from './store.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const input = createAudioInput();
const player = $('#player');
let rec = null; // grabación en curso: { id, name, format, date, frames, paused, interrupted, markers, pending, pendingFrames }
let wakeLock = null;

// ---------- Mensajes ----------
const setMsg = (text) => { $('#msg').textContent = text; };
function setState(text, cls = '') {
  const el = $('#state');
  el.textContent = text;
  el.className = `state ${cls}`;
}

function micError(err) {
  if (err?.name === 'NotAllowedError') {
    return 'No hay permiso para usar el micrófono. En iPhone: tocá «aA» en la barra de la dirección → Configuración del sitio web → Micrófono → Permitir. '
      + 'En Android: tocá el candado (o los ajustes) al lado de la dirección → Permisos → Micrófono → Permitir. Después tocá «Activar micrófono» de nuevo.';
  }
  if (err?.name === 'NotFoundError') return 'No se encontró ningún micrófono en este celu.';
  if (err?.name === 'NotReadableError') return 'Otra app está usando el micrófono (por ejemplo, una llamada). Cerrala y probá de nuevo.';
  return `No se pudo abrir el micrófono: ${err?.message || err}`;
}

// ---------- Hilo que escribe los archivos ----------
const worker = new Worker(new URL('./rec-worker.js', import.meta.url), { type: 'module' });
const waiting = new Map(); // tipo de respuesta → [{ ok, fail }]
function call(msg, reply) {
  return new Promise((ok, fail) => {
    if (!waiting.has(reply)) waiting.set(reply, []);
    waiting.get(reply).push({ ok, fail });
    worker.postMessage(msg);
  });
}
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'error') {
    for (const list of waiting.values()) list.forEach((p) => p.fail(new Error(m.message)));
    waiting.clear();
    setMsg(`Problema al guardar en el celu: ${m.message}`);
    return;
  }
  waiting.get(m.type)?.shift()?.ok(m);
};

// ---------- Activar el micrófono ----------
async function activate() {
  setMsg('');
  try {
    await input.open();
    navigator.storage.persist?.().catch(() => {}); // que el navegador no borre las grabaciones por su cuenta
    $('#activate').hidden = true;
    setState('Listo para grabar');
  } catch (err) {
    setMsg(micError(err));
  }
  updateUi();
}

// ---------- Medidor: escala en dB (-60 a 0). La rayita marca -12 dB. ----------
const dbOf = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
let peakHold = -Infinity, clipUntil = 0;
function drawMeter() {
  const lv = input.level();
  const now = performance.now();
  peakHold = Math.max(dbOf(lv), peakHold - 0.4); // sube al instante, baja despacio
  const fill = $('.meter-fill');
  fill.style.width = `${Math.max(0, Math.min(1, (peakHold + 60) / 60)) * 100}%`;
  fill.style.setProperty('--meter-w', `${$('.meter').clientWidth}px`);
  if (lv >= 0.98) clipUntil = now + 2500;
  $('.clip').classList.toggle('on', now < clipUntil);
  $('.db').textContent = Number.isFinite(peakHold) && peakHold > -60 ? `${peakHold.toFixed(0)} dB` : '—';
  requestAnimationFrame(drawMeter);
}

// ---------- Formato ----------
const FORMAT_KEY = 'easyrec.formato';
const currentFormat = () => $('input[name=format]:checked').value;
for (const r of document.querySelectorAll('input[name=format]')) {
  r.checked = r.value === (localStorage.getItem(FORMAT_KEY) || 'wav');
  r.addEventListener('change', () => { localStorage.setItem(FORMAT_KEY, r.value); updateSpace(); });
}

// ---------- Grabar ----------
function askName() {
  return new Promise((done) => {
    const modal = $('#name-modal'), field = $('#rec-name');
    field.value = defaultName();
    modal.hidden = false;
    field.focus();
    field.select();
    const close = (value) => { modal.hidden = true; done(value); };
    $('#name-form').onsubmit = (e) => { e.preventDefault(); close(field.value.trim() || defaultName()); };
    $('#name-cancel').onclick = () => close(null);
  });
}

const record = (r, status) => ({ id: r.id, name: r.name, format: r.format, date: r.date, duration: r.frames / SAMPLE_RATE, status, markers: r.markers });

async function startRecording() {
  if (rec) return;
  const name = await askName();
  if (!name) return;
  try { await input.ensureLive(); } catch (err) { setMsg(micError(err)); return; }
  const format = currentFormat();
  const mins = await store.freeMinutes(format);
  if (mins != null && mins < 10 && !confirm(`Queda poco lugar en el celu: entran unos ${mins} minutos en este formato. ¿Grabar igual?`)) return;
  const id = String(Date.now());
  try {
    await call({ type: 'start', id, sampleRate: SAMPLE_RATE, wav: format !== 'mp3', mp3: format !== 'wav' }, 'started');
  } catch (err) {
    setMsg(`No se pudo empezar a grabar: ${err.message}`);
    return;
  }
  setMsg('');
  rec = { id, name, format, date: Date.now(), frames: 0, paused: false, interrupted: false, markers: [], pending: [], pendingFrames: 0 };
  store.upsert(record(rec, 'grabando'));
  input.startCapture(onAudio);
  keepAwake(true);
  updateUi();
  renderList();
}

function onAudio(block) {
  if (!rec || rec.paused) return;
  rec.pending.push(block);
  rec.pendingFrames += block.length;
  rec.frames += block.length;
  if (rec.pendingFrames >= SAMPLE_RATE / 4) sendPending(); // de a 1/4 de segundo
}

function sendPending() {
  if (!rec?.pendingFrames) return;
  const samples = new Float32Array(rec.pendingFrames);
  let at = 0;
  for (const b of rec.pending) { samples.set(b, at); at += b.length; }
  rec.pending = [];
  rec.pendingFrames = 0;
  worker.postMessage({ type: 'data', samples }, [samples.buffer]);
}

async function togglePause() {
  if (!rec) return;
  if (!rec.paused) {
    sendPending();
    rec.paused = true;
  } else {
    try { await input.ensureLive(); } catch (err) { setMsg(micError(err)); return; }
    rec.paused = false;
    rec.interrupted = false;
    setMsg('');
    keepAwake(true);
  }
  updateUi();
}

function addMarker() {
  if (!rec || rec.paused) return;
  const t = rec.frames / SAMPLE_RATE;
  rec.markers.push(t);
  worker.postMessage({ type: 'markers', text: markersText(rec.name, rec.markers) });
  store.upsert(record(rec, 'grabando'));
  setState(`Marca ${rec.markers.length} en ${fmtTime(t)}`, 'live');
  setTimeout(updateUi, 1500);
}

async function stopRecording() {
  if (!rec) return;
  const r = rec;
  input.stopCapture();
  sendPending();
  let seconds = r.frames / SAMPLE_RATE;
  try { seconds = (await call({ type: 'stop' }, 'stopped')).seconds; } catch { /* el aviso ya se mostró */ }
  store.upsert({ ...record(r, 'lista'), duration: seconds });
  rec = null;
  keepAwake(false);
  $('#time').textContent = fmtTime(seconds);
  setMsg('');
  updateUi();
  setState(`Guardada (${fmtTime(seconds)}). Guardala o compartila desde la lista.`);
  renderList();
}

// Pantalla prendida mientras hay una grabación en curso
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock && !document.hidden) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* este navegador no lo permite: queda el aviso en pantalla */ }
}

// Si se bloquea el celu o se cambia de app, el sistema corta el micrófono: se pausa sola para que lo grabado quede bien.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (rec && !rec.paused) { togglePause(); rec.interrupted = true; }
  } else if (rec) {
    if (rec.interrupted) setMsg('La grabación se puso en pausa porque saliste de la pantalla. Lo grabado está a salvo: tocá «Seguir» para continuar.');
    keepAwake(true);
  }
});
window.addEventListener('beforeunload', (e) => { if (rec) { e.preventDefault(); e.returnValue = ''; } });

function updateUi() {
  const on = input.isOpen;
  const recBtn = $('#rec');
  recBtn.disabled = !on || !!rec;
  recBtn.classList.toggle('recording', !!rec && !rec.paused);
  recBtn.classList.toggle('paused', !!rec?.paused);
  $('#pause').disabled = !rec;
  $('#pause').textContent = rec?.paused ? '▶ Seguir' : '⏸ Pausa';
  $('#marker').disabled = !rec || rec.paused;
  $('#stop').disabled = !rec;
  $('#keep').hidden = !rec;
  for (const r of document.querySelectorAll('input[name=format]')) r.disabled = !!rec;
  if (rec) setState(rec.paused ? 'EN PAUSA — no se está grabando' : '● GRABANDO', rec.paused ? 'paused' : 'live');
}

function tick() {
  if (rec) $('#time').textContent = fmtTime(rec.frames / SAMPLE_RATE);
}

// ---------- Lista de grabaciones ----------
const fmtDate = (ms) => new Date(ms).toLocaleString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
let filesById = new Map();

async function renderList() {
  const all = store.list();
  const box = $('#recordings');
  updateSpace();
  if (!all.length) { box.innerHTML = '<p class="empty">Todavía no hay grabaciones.</p>'; return; }
  // Los archivos se preparan antes: en iPhone, "compartir" tiene que salir enseguida después del toque.
  const rows = await Promise.all(all.map(async (r) => ({ r, files: r.status === 'grabando' ? [] : await store.files(r) })));
  filesById = new Map(rows.map(({ r, files }) => [r.id, files]));
  box.innerHTML = rows.map(({ r, files }) => `
    <div class="rec-item" data-id="${r.id}">
      <div>
        <div class="r-name">${esc(r.name)}${r.status === 'grabando' ? '<span class="r-badge live">● grabando</span>' : ''}${r.status === 'cortada' ? '<span class="r-badge cut">se cortó</span>' : ''}</div>
        <div class="r-meta">${fmtDate(r.date)} · ${r.status === 'grabando' ? 'grabando…' : fmtTime(r.duration)}${r.markers.length ? ` · ${r.markers.length} marca${r.markers.length > 1 ? 's' : ''}` : ''}</div>
      </div>
      ${files.map((f, i) => `
        <div class="r-file" data-i="${i}">
          <span class="r-kind">${f.kind}</span>
          ${f.kind === 'Marcas' ? '<span></span>' : '<button class="btn r-play">▶ Escuchar</button>'}
          <button class="btn r-share">Guardar / Compartir</button>
        </div>`).join('')}
      ${r.status === 'grabando' ? '' : '<button class="btn r-remove btn-danger">Borrar</button>'}
    </div>`).join('');
  markPlaying();
}

async function updateSpace() {
  const mins = await store.freeMinutes(currentFormat());
  const label = { wav: 'WAV', mp3: 'MP3', both: 'WAV + MP3' }[currentFormat()];
  $('#space').textContent = mins == null ? '' : `Lugar libre en el celu: unas ${mins >= 120 ? `${Math.floor(mins / 60)} horas` : `${mins} minutos`} de grabación en ${label}.`;
}

function markPlaying() {
  for (const b of document.querySelectorAll('.r-play')) {
    const key = `${b.closest('.rec-item').dataset.id}:${b.closest('.r-file').dataset.i}`;
    const on = !player.paused && player.dataset.key === key;
    b.classList.toggle('playing', on);
    b.textContent = on ? '■ Parar' : '▶ Escuchar';
  }
}

function play(file, key) {
  if (!player.paused && player.dataset.key === key) { player.pause(); return; }
  if (player.src) URL.revokeObjectURL(player.src);
  player.src = URL.createObjectURL(file);
  player.dataset.key = key;
  player.play().catch((err) => setMsg(`No se pudo reproducir: ${err.message}`));
}

/** Abre el menú de compartir del celu (Archivos, Drive, WhatsApp…). Si no se puede, lo descarga. */
function share(file) {
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch((err) => { if (err.name !== 'AbortError') download(file); });
  } else download(file);
}

function download(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

$('#recordings').addEventListener('click', async (e) => {
  const item = e.target.closest('.rec-item');
  if (!item) return;
  const id = item.dataset.id;
  const row = e.target.closest('.r-file');
  const f = row && filesById.get(id)?.[Number(row.dataset.i)];
  if (e.target.closest('.r-play') && f) play(f.file, `${id}:${row.dataset.i}`);
  else if (e.target.closest('.r-share') && f) share(f.file);
  else if (e.target.closest('.r-remove')) {
    const r = store.list().find((x) => x.id === id);
    if (!r || !confirm(`¿Borrar «${r.name}» del celu? No se puede deshacer.`)) return;
    if (player.dataset.key?.startsWith(`${id}:`)) player.pause();
    await store.remove(id);
    renderList();
  }
});
for (const ev of ['play', 'pause', 'ended']) player.addEventListener(ev, markPlaying);

$('#activate').addEventListener('click', activate);
$('#rec').addEventListener('click', startRecording);
$('#pause').addEventListener('click', togglePause);
$('#marker').addEventListener('click', addMarker);
$('#stop').addEventListener('click', stopRecording);

// Para las pruebas automáticas
window.__easyrec = { addMarker, togglePause, stopRecording, get rec() { return rec; } };

// ---------- Arranque ----------
const unsupported = !window.isSecureContext
  ? 'Esta página tiene que abrirse desde su dirección segura (la que empieza con https://) para poder usar el micrófono.'
  : !(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode && navigator.storage?.getDirectory && window.Worker)
    ? 'Este navegador no sirve para grabar. Actualizá el celu y abrila con Safari (iPhone) o Chrome (Android).'
    : null;
if (unsupported) {
  setMsg(unsupported);
  $('#activate').disabled = true;
} else {
  await store.recoverInterrupted((id) => call({ type: 'repair', id, sampleRate: SAMPLE_RATE }, 'repaired').then((m) => m.seconds).catch(() => null));
}
renderList();
updateUi();
drawMeter();
setInterval(tick, 200);
