// Piezas sin navegador: armar WAV y MP3, y los textos y nombres (iguales a la app de compu).
import { Mp3Encoder } from './vendor/lamejs.js';

/** Encabezado de un WAV mono de 24 bits con `dataBytes` bytes de audio. */
export function wavHeader(sampleRate, dataBytes) {
  const h = new Uint8Array(44);
  const v = new DataView(h.buffer);
  const str = (at, s) => { for (let i = 0; i < s.length; i++) h[at + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 3, true);
  v.setUint16(32, 3, true); v.setUint16(34, 24, true);
  str(36, 'data'); v.setUint32(40, dataBytes, true);
  return h;
}

/** Muestras (-1 a 1) → 24 bits. Lo que se pasa de rango se limita (no da la vuelta). */
export function floatTo24(samples) {
  const b = new Uint8Array(samples.length * 3);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.round(Math.max(-1, Math.min(1, samples[i])) * 8388607);
    b[i * 3] = v & 0xff; b[i * 3 + 1] = (v >> 8) & 0xff; b[i * 3 + 2] = (v >> 16) & 0xff;
  }
  return b;
}

/** MP3 mono (320 kbps): cada pedazo que devuelve son cuadros que sirven solos. */
export class Mp3Stream {
  constructor(sampleRate, kbps = 320) { this.encoder = new Mp3Encoder(1, sampleRate, kbps); }

  encode(samples) {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) pcm[i] = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767);
    const parts = [];
    for (let i = 0; i < pcm.length; i += 1152) parts.push(this.encoder.encodeBuffer(pcm.subarray(i, i + 1152)));
    return join(parts);
  }

  end() { return join([this.encoder.flush()]); }
}

function join(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
export const fmtTime = (sec) => { const s = Math.floor(sec); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };

/** Texto del archivo de marcas: una por renglón, con el tiempo grabado. */
export const markersText = (name, secs) => `Marcas de "${name}" (tiempo desde el principio de la grabación)\r\n\r\n`
  + secs.map((t, i) => `Marca ${i + 1}\t${fmtTime(t)}`).join('\r\n') + '\r\n';

/** Nombre válido para un archivo (sin \ / : * ? " < > | ni punto o espacio al final). */
export function safeName(s) {
  const clean = String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/[. ]+$/, '').trim();
  return clean.slice(0, 120) || 'Grabación';
}

export const defaultName = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
