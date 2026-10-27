// Hilo aparte que escribe los archivos MIENTRAS se graba, dentro del almacenamiento privado del navegador (OPFS).
// Si se cierra todo de golpe, lo grabado hasta el último segundo queda: el WAV actualiza su encabezado cada 1 s
// y el MP3 está hecho de cuadritos que sirven solos.
// En Safari viejo varios métodos de los "handles" devolvían promesas: por eso todo va con await.
import { wavHeader, floatTo24, Mp3Stream } from './encoders.js';

let rec = null; // { dir, wav, mp3, enc, wavBytes, mp3Bytes, frames, sinceFlush, sampleRate }

async function recDir(id) {
  const root = await navigator.storage.getDirectory();
  const all = await root.getDirectoryHandle('rec', { create: true });
  return all.getDirectoryHandle(id, { create: true });
}

async function openHandle(dir, name) {
  const fh = await dir.getFileHandle(name, { create: true });
  const h = await fh.createSyncAccessHandle();
  await h.truncate(0);
  return h;
}

async function start({ id, sampleRate, wav, mp3 }) {
  const dir = await recDir(id);
  rec = { dir, wav: null, mp3: null, enc: null, wavBytes: 0, mp3Bytes: 0, frames: 0, sinceFlush: 0, sampleRate };
  if (wav) {
    rec.wav = await openHandle(dir, 'audio.wav');
    rec.wav.write(wavHeader(sampleRate, 0), { at: 0 });
  }
  if (mp3) {
    rec.mp3 = await openHandle(dir, 'audio.mp3');
    rec.enc = new Mp3Stream(sampleRate);
  }
}

function writeMp3(bytes) {
  if (!bytes.length) return;
  rec.mp3.write(bytes, { at: rec.mp3Bytes });
  rec.mp3Bytes += bytes.length;
}

async function data(samples) {
  if (!rec) return;
  if (rec.wav) {
    const b = floatTo24(samples);
    rec.wav.write(b, { at: 44 + rec.wavBytes });
    rec.wavBytes += b.length;
  }
  if (rec.mp3) writeMp3(rec.enc.encode(samples));
  rec.frames += samples.length;
  rec.sinceFlush += samples.length;
  if (rec.sinceFlush >= rec.sampleRate) { rec.sinceFlush = 0; await flush(); }
}

async function flush() {
  if (rec.wav) { rec.wav.write(wavHeader(rec.sampleRate, rec.wavBytes), { at: 0 }); await rec.wav.flush(); }
  if (rec.mp3) await rec.mp3.flush();
}

async function markers(text) {
  if (!rec) return;
  const h = await openHandle(rec.dir, 'marcas.txt');
  h.write(new TextEncoder().encode(text), { at: 0 });
  await h.flush();
  await h.close();
}

async function stop() {
  if (!rec) return 0;
  if (rec.mp3) writeMp3(rec.enc.end());
  await flush();
  for (const h of [rec.wav, rec.mp3]) if (h) await h.close();
  const seconds = rec.frames / rec.sampleRate;
  rec = null;
  return seconds;
}

/** WAV que quedó cortado: el encabezado puede estar hasta 1 s atrasado; se corrige según el tamaño real. */
async function repair({ id, sampleRate }) {
  const dir = await recDir(id);
  let fh;
  try { fh = await dir.getFileHandle('audio.wav'); } catch { return null; }
  const h = await fh.createSyncAccessHandle();
  const size = await h.getSize();
  const dataBytes = Math.max(0, Math.floor((size - 44) / 3) * 3);
  h.write(wavHeader(sampleRate, dataBytes), { at: 0 });
  await h.flush();
  await h.close();
  return dataBytes / 3 / sampleRate;
}

// Los mensajes se atienden de a uno y en orden (si no, un "stop" podría pasar antes que el último audio).
let queue = Promise.resolve();
self.onmessage = (e) => {
  const m = e.data;
  queue = queue.then(async () => {
    try {
      if (m.type === 'start') { await start(m); self.postMessage({ type: 'started' }); }
      else if (m.type === 'data') await data(m.samples);
      else if (m.type === 'markers') await markers(m.text);
      else if (m.type === 'stop') self.postMessage({ type: 'stopped', seconds: await stop() });
      else if (m.type === 'repair') self.postMessage({ type: 'repaired', id: m.id, seconds: await repair(m) });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err?.message || err) });
    }
  });
};
