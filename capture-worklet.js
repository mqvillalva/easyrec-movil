// Corre dentro del motor de audio: copia lo que entra por la placa, bloque por bloque.
class EasyRecCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.port.onmessage = (e) => { this.on = e.data === 'start'; };
  }

  process(inputs) {
    const input = inputs[0];
    if (this.on && input && input.length) this.port.postMessage(input.map((ch) => ch.slice()));
    return true;
  }
}

registerProcessor('easyrec-capture', EasyRecCapture);
