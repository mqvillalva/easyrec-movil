// Lista de grabaciones (en el navegador) y sus archivos (en el almacenamiento privado del navegador, OPFS).
// Cada grabación vive en rec/<id>/ con audio.wav, audio.mp3 y marcas.txt.
import { safeName } from './encoders.js';

const KEY = 'easyrec.grabaciones';
const KINDS = [
  { kind: 'WAV', file: 'audio.wav', type: 'audio/wav', ext: '.wav' },
  { kind: 'MP3', file: 'audio.mp3', type: 'audio/mpeg', ext: '.mp3' },
  { kind: 'Marcas', file: 'marcas.txt', type: 'text/plain', ext: ' - Marcas.txt' },
];
// Bytes por minuto de cada formato (para calcular cuánto entra)
const PER_MIN = { wav: 48000 * 3 * 60, mp3: 320000 / 8 * 60 };

export function list() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
const save = (all) => localStorage.setItem(KEY, JSON.stringify(all));

export function upsert(rec) {
  const all = list();
  const i = all.findIndex((r) => r.id === rec.id);
  if (i >= 0) all[i] = rec; else all.unshift(rec);
  save(all);
}

async function recRoot() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('rec', { create: true });
}

export async function remove(id) {
  save(list().filter((r) => r.id !== id));
  try { await (await recRoot()).removeEntry(id, { recursive: true }); } catch { /* ya no estaba */ }
}

/** Archivos de una grabación, listos para escuchar o compartir, con su nombre final ("Nombre.wav"). */
export async function files(rec) {
  let dir;
  try { dir = await (await recRoot()).getDirectoryHandle(rec.id); } catch { return []; }
  const out = [];
  for (const k of KINDS) {
    try {
      const f = await (await dir.getFileHandle(k.file)).getFile();
      out.push({ kind: k.kind, file: new File([f], safeName(rec.name) + k.ext, { type: k.type }) });
    } catch { /* ese formato no se grabó */ }
  }
  return out;
}

/** Grabaciones que quedaron "grabando" (se cerró todo de golpe) → "cortada", con lo que se alcanzó a guardar. */
export async function recoverInterrupted(repairWav) {
  for (const r of list().filter((x) => x.status === 'grabando')) {
    let seconds = await repairWav(r.id);
    if (seconds == null) {
      const mp3 = (await files(r)).find((f) => f.kind === 'MP3');
      seconds = mp3 ? mp3.file.size * 8 / 320000 : 0;
    }
    upsert({ ...r, status: 'cortada', duration: seconds });
  }
}

/** Minutos aproximados que entran en el celu con ese formato (null si el navegador no lo dice). */
export async function freeMinutes(format) {
  const est = await navigator.storage?.estimate?.();
  if (!est?.quota) return null;
  const perMin = format === 'wav' ? PER_MIN.wav : format === 'mp3' ? PER_MIN.mp3 : PER_MIN.wav + PER_MIN.mp3;
  return Math.floor((est.quota - (est.usage || 0)) / perMin);
}
