// Prueba la página de verdad (en Electron = Chrome) con un micrófono simulado y pantalla de celular:
// grabación cortada recuperada, activar, grabar en WAV+MP3, marca, pausa sola al ocultar, seguir, detener,
// archivos correctos, escuchar, compartir/bajar y borrar.
// Correr: npm run smoke
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');

app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'easyrec-movil-')));

const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const check = (ok, what) => { log(ok ? '  ok ' : '  MAL', what); if (!ok) problems.push(what); };
setTimeout(() => { log('FALLÓ: tardó demasiado'); app.exit(1); }, 120000);

// Lee un archivo de una grabación desde el almacenamiento privado de la página
const readFile = (id, name) => `(async () => {
  const root = await navigator.storage.getDirectory();
  const dir = await (await root.getDirectoryHandle('rec')).getDirectoryHandle(${JSON.stringify(id)});
  const f = await (await dir.getFileHandle(${JSON.stringify(name)})).getFile();
  return Array.from(new Uint8Array(await f.arrayBuffer()));
})()`;

app.whenReady().then(async () => {
  const { serve } = await import('../tools/serve.mjs');
  const server = await serve(0);
  const url = `http://localhost:${server.address().port}/`;
  const win = new BrowserWindow({ width: 390, height: 844, show: true, webPreferences: { backgroundThrottling: true } });
  const wc = win.webContents;
  const errs = [];
  wc.on('console-message', (e) => { if (e.level === 'error') errs.push(e.message); });
  const js = (code) => wc.executeJavaScript(code, true); // true = como si fuera un toque del usuario
  const ready = () => js(`new Promise((ok) => { const t = setInterval(() => { if (window.__easyrec && document.querySelector('#recordings').children.length) { clearInterval(t); ok(); } }, 100); })`);

  try {
    // 1) Grabación que quedó a medias: WAV con 1 s de audio pero el encabezado dice 0 (se cortó antes del primer segundo)
    await wc.loadURL(url);
    await ready();
    await js(`(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await (await root.getDirectoryHandle('rec', { create: true })).getDirectoryHandle('vieja', { create: true });
      const w = await (await dir.getFileHandle('audio.wav', { create: true })).createWritable();
      const h = new Uint8Array(44 + 48000 * 3); const v = new DataView(h.buffer);
      [..."RIFF"].forEach((c, i) => h[i] = c.charCodeAt(0)); [..."WAVEfmt "].forEach((c, i) => h[8 + i] = c.charCodeAt(0)); [..."data"].forEach((c, i) => h[36 + i] = c.charCodeAt(0));
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 48000, true); v.setUint32(28, 144000, true); v.setUint16(32, 3, true); v.setUint16(34, 24, true);
      await w.write(h); await w.close();
      localStorage.setItem('easyrec.grabaciones', JSON.stringify([{ id: 'vieja', name: 'Vieja', format: 'wav', date: Date.now() - 1e6, duration: 0, status: 'grabando', markers: [] }]));
    })()`);
    await wc.reload();
    await ready();
    log('Grabación cortada:');
    const old = await js(`JSON.parse(localStorage.getItem('easyrec.grabaciones'))[0]`);
    check(old.status === 'cortada' && Math.abs(old.duration - 1) < 0.01, `queda "se cortó" con 1 s (${old.status}, ${old.duration})`);
    const oldWav = Buffer.from(await js(readFile('vieja', 'audio.wav')));
    check(oldWav.readUInt32LE(40) === 48000 * 3 && oldWav.readUInt32LE(4) === oldWav.length - 8, 'encabezado del WAV corregido');
    check(await js(`document.querySelector('.r-badge.cut')?.textContent === 'se cortó'`), 'la lista muestra "se cortó"');

    // 2) Activar y grabar
    log('Grabar:');
    check(await js(`document.querySelector('#rec').disabled`), 'Grabar desactivado hasta activar el micrófono');
    await js(`document.querySelector('#activate').click()`);
    await wait(1000);
    check(await js(`document.querySelector('#activate').offsetParent === null && !document.querySelector('#rec').disabled`), 'micrófono activado y el botón de activar ya no se ve');
    log('  medidor:', await js(`document.querySelector('.db').textContent`));
    // Escuchar en auriculares (volumen casi en 0 para que no suene en la compu)
    check(await js(`!document.querySelector('#monitor-on').disabled && !document.querySelector('#monitor-on').checked && window.__easyrec.monitorVolume === 0`), 'escucha en auriculares disponible y apagada de entrada');
    await js(`const v = document.querySelector('#monitor-vol'); v.value = '0.05'; v.dispatchEvent(new Event('input')); document.querySelector('#monitor-on').click()`);
    await wait(400);
    check(await js(`Math.abs(window.__easyrec.monitorVolume - 0.05) < 0.005 && document.querySelector('#monitor-warn').offsetParent !== null && document.querySelector('#monitor-vol').offsetParent !== null`), 'al prenderla suena con su volumen y aparece el aviso');
    await js(`document.querySelector('#monitor-on').click()`);
    await wait(400);
    check(await js(`window.__easyrec.monitorVolume < 0.001 && document.querySelector('#monitor-warn').offsetParent === null`), 'al apagarla deja de sonar');
    await js(`document.querySelector('input[name=format][value=both]').click()`);
    await js(`document.querySelector('#rec').click()`);
    await wait(300);
    log('  nombre propuesto:', await js(`document.querySelector('#rec-name').value`));
    await js(`document.querySelector('#rec-name').value = 'Entrevista: Ana / Juan'; document.querySelector('#name-form').requestSubmit()`);
    await wait(2000);
    check(await js(`document.querySelector('#state').textContent === '● GRABANDO' && !document.querySelector('#keep').hidden`), 'grabando, con el aviso de no bloquear el celu');
    await js(`window.__easyrec.addMarker()`);
    await wait(1000);

    // 3) Página oculta → pausa sola
    win.hide();
    await wait(800);
    check(await js(`window.__easyrec.rec.paused && document.hidden`), 'al ocultar la página se pausa sola');
    win.show();
    await wait(800);
    check(await js(`document.querySelector('#msg').textContent.includes('se puso en pausa')`), 'al volver avisa que está en pausa');
    check(await js(`document.querySelector('#pause').textContent === '▶ Seguir'`), 'el botón dice Seguir');
    await js(`document.querySelector('#pause').click()`);
    await wait(1000);
    await js(`document.querySelector('#stop').click()`);
    await wait(1500);
    log('  estado:', await js(`document.querySelector('#state').textContent`));

    // 4) Archivos
    log('Archivos:');
    const recs = await js(`JSON.parse(localStorage.getItem('easyrec.grabaciones'))`);
    const r = recs.find((x) => x.name === 'Entrevista: Ana / Juan');
    check(r && r.status === 'lista' && r.markers.length === 1, 'en la lista como lista, con 1 marca');
    const wav = Buffer.from(await js(readFile(r.id, 'audio.wav')));
    const secs = wav.readUInt32LE(40) / 3 / 48000;
    let peak = 0; for (let i = 44; i < wav.length - 2; i += 3) peak = Math.max(peak, Math.abs(wav.readIntLE(i, 3)));
    check(wav.toString('ascii', 0, 4) === 'RIFF' && wav.readUInt32LE(4) === wav.length - 8 && wav.readUInt16LE(34) === 24 && wav.readUInt32LE(24) === 48000, 'WAV 24 bits/48 kHz con encabezado correcto');
    check(secs > 3.5 && secs < 4.6 && Math.abs(secs - r.duration) < 0.01, `WAV dura ${secs.toFixed(2)} s (sin la pausa)`);
    check(peak > 1000, `el WAV tiene sonido (pico ${(peak / 8388607).toFixed(2)})`);
    const mp3 = Buffer.from(await js(readFile(r.id, 'audio.mp3')));
    check(mp3[0] === 0xff && Math.abs(mp3.length * 8 / 320000 - secs) < 0.15, `MP3 válido de ${(mp3.length * 8 / 320000).toFixed(2)} s`);
    const txt = Buffer.from(await js(readFile(r.id, 'marcas.txt'))).toString('utf8');
    check(txt.startsWith('Marcas de "Entrevista: Ana / Juan"') && txt.includes('Marca 1\t00:00:0'), 'marcas.txt bien');

    // 5) Lista: escuchar, compartir/bajar, borrar
    log('Lista:');
    const item = `document.querySelector('.rec-item[data-id="${r.id}"]')`;
    check(await js(`${item}.querySelectorAll('.r-file').length === 3 && ${item}.querySelectorAll('.r-share').length === 3`), 'WAV, MP3 y Marcas con Guardar / Compartir');
    check(await js(`[...${item}.querySelectorAll('.r-kind')].map((e) => e.textContent).join(',') === 'WAV,MP3,Marcas'`), 'en orden WAV, MP3, Marcas');
    await js(`${item}.querySelector('.r-play').click()`);
    await wait(800);
    check(await js(`!document.querySelector('#player').paused && document.querySelector('#player').currentTime > 0 && ${item}.querySelector('.r-play').textContent === '■ Parar'`), 'se escucha el WAV');
    const names = await js(`new Promise((ok) => {
      const got = []; const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { got.push(this.download); };
      ${item}.querySelectorAll('.r-share').forEach((b) => b.click());
      HTMLAnchorElement.prototype.click = orig; ok(got);
    })`);
    check(names.join(' | ') === 'Entrevista- Ana - Juan.wav | Entrevista- Ana - Juan.mp3 | Entrevista- Ana - Juan - Marcas.txt', `nombres al bajar: ${names.join(' | ')}`);
    const shot = process.env.SHOT || path.join(os.tmpdir(), 'easyrec-movil.png');
    await wc.capturePage().then((img) => fs.writeFileSync(shot, img.toPNG()));
    await js(`window.scrollTo(0, document.body.scrollHeight)`);
    await wait(300);
    await wc.capturePage().then((img) => fs.writeFileSync(shot.replace(/\.png$/, '-lista.png'), img.toPNG()));
    await js(`window.confirm = () => true; document.querySelector('.rec-item[data-id="vieja"] .r-remove').click()`);
    await wait(800);
    check(await js(`!document.querySelector('.rec-item[data-id="vieja"]') && !JSON.parse(localStorage.getItem('easyrec.grabaciones')).some((x) => x.id === 'vieja')`), 'Borrar la saca de la lista');
    check(!(await js(`(async () => { try { await (await (await navigator.storage.getDirectory()).getDirectoryHandle('rec')).getDirectoryHandle('vieja'); return true; } catch { return false; } })()`)), 'y borra sus archivos del celu');
    log(errs.length ? 'ERRORES EN LA PÁGINA:\n' + errs.join('\n') : 'sin errores en la página');
  } catch (err) {
    problems.push(String(err));
    log('FALLÓ:', err.stack || err);
  }
  log(problems.length || errs.length ? `\n${problems.length} problema(s)` : '\nTODO BIEN');
  app.exit(problems.length || errs.length ? 1 : 0);
});
