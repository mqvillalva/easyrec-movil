import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wavHeader, floatTo24, Mp3Stream, fmtTime, markersText, safeName, defaultName } from '../encoders.js';

const sine = (n, f = 440, rate = 48000) => Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin(2 * Math.PI * f * i / rate));
const ascii = (b, from, to) => String.fromCharCode(...b.slice(from, to));
const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

test('encabezado WAV mono 24 bits con los tamaños correctos', () => {
  const h = wavHeader(48000, 300);
  const v = dv(h);
  assert.equal(h.length, 44);
  assert.equal(ascii(h, 0, 4), 'RIFF');
  assert.equal(ascii(h, 8, 16), 'WAVEfmt ');
  assert.equal(ascii(h, 36, 40), 'data');
  assert.equal(v.getUint32(4, true), 36 + 300);
  assert.equal(v.getUint16(20, true), 1); // PCM
  assert.equal(v.getUint16(22, true), 1); // mono
  assert.equal(v.getUint32(24, true), 48000);
  assert.equal(v.getUint32(28, true), 48000 * 3);
  assert.equal(v.getUint16(32, true), 3);
  assert.equal(v.getUint16(34, true), 24);
  assert.equal(v.getUint32(40, true), 300);
});

test('24 bits: valores extremos y recorte (no da la vuelta)', () => {
  const b = floatTo24(Float32Array.of(0, 1, -1, 2, -2));
  const get = (i) => { const x = b[i * 3] | (b[i * 3 + 1] << 8) | (b[i * 3 + 2] << 16); return x & 0x800000 ? x - 0x1000000 : x; };
  assert.equal(b.length, 15);
  assert.deepEqual([0, 1, 2, 3, 4].map(get), [0, 8388607, -8388607, 8388607, -8388607]);
});

test('MP3 320 kbps: cuadros válidos y largo correcto', () => {
  const m = new Mp3Stream(48000);
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push(m.encode(sine(12000)));
  parts.push(m.end());
  const bytes = Buffer.concat(parts.map((p) => Buffer.from(p)));
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1] & 0xe0, 0xe0);
  const secs = bytes.length * 8 / 320000;
  assert.ok(Math.abs(secs - 1) < 0.08, `dura ${secs}`);
});

test('tiempos y texto de marcas como en la app de compu', () => {
  assert.equal(fmtTime(0), '00:00:00');
  assert.equal(fmtTime(3725.9), '01:02:05');
  assert.equal(markersText('Charla', [1, 65]),
    'Marcas de "Charla" (tiempo desde el principio de la grabación)\r\n\r\nMarca 1\t00:00:01\r\nMarca 2\t00:01:05\r\n');
});

test('nombres de archivo válidos y nombre por defecto con fecha y hora', () => {
  assert.equal(safeName('Entrevista: Ana / Juan'), 'Entrevista- Ana - Juan');
  assert.equal(safeName('  ...  '), 'Grabación');
  assert.equal(safeName('Hola. '), 'Hola');
  assert.equal(defaultName(new Date(2026, 9, 5, 9, 7)), '2026-10-05 09.07');
});
