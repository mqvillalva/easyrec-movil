// Micrófono del celu: lo abre sin "mejoras" (sin cancelación de eco, sin supresión de ruido, sin volumen automático),
// mide el nivel y entrega lo que entra (mono). Si el sistema corta el micrófono (llamada, bloqueo), se vuelve a abrir.
export const SAMPLE_RATE = 48000;

export function createAudioInput() {
  let ctx = null, ready = null, analyser = null, sink = null;
  let stream = null, source = null, capture = null;
  let onData = null, capturing = false;
  const buf = new Float32Array(2048);

  /** Llamar desde un toque del usuario (en iPhone el audio solo arranca así). */
  async function open() {
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'playback' });
      ready = ctx.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url));
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      sink = ctx.createGain();
      sink.gain.value = 0;
      sink.connect(ctx.destination); // el motor solo procesa lo que llega a la salida
    }
    const resumed = ctx.resume(); // antes de cualquier espera, para no perder el "toque"
    close();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: { ideal: 1 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    await ready;
    await resumed;
    source = ctx.createMediaStreamSource(stream);
    capture = new AudioWorkletNode(ctx, 'easyrec-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    capture.port.onmessage = (e) => onData?.(e.data[0]);
    source.connect(capture).connect(sink);
    source.connect(analyser);
    if (capturing) capture.port.postMessage('start');
  }

  function close() {
    stream?.getTracks().forEach((t) => t.stop());
    for (const n of [source, capture]) n?.disconnect();
    stream = source = capture = null;
  }

  /** Vuelve a abrir el micrófono si el sistema lo cortó mientras la página estaba oculta. */
  async function ensureLive() {
    const track = stream?.getAudioTracks()[0];
    if (!track || track.readyState === 'ended') await open();
    else if (ctx.state !== 'running') await ctx.resume();
  }

  /** Pico (0 a 1) en el último instante. */
  function level() {
    if (!stream) return 0;
    analyser.getFloatTimeDomainData(buf);
    let m = 0;
    for (const x of buf) { const v = Math.abs(x); if (v > m) m = v; }
    return m;
  }

  return {
    open, ensureLive, level,
    /** fn recibe un Float32Array (mono) cada 128 muestras. */
    startCapture(fn) { onData = fn; capturing = true; capture?.port.postMessage('start'); },
    stopCapture() { capturing = false; capture?.port.postMessage('stop'); onData = null; },
    get isOpen() { return !!stream; },
  };
}
