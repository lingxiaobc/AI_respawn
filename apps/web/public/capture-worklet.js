class PttCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.ratio = sampleRate / 16000;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.frame = new Int16Array(320);
    this.frameOffset = 0;
    this.port.onmessage = (event) => {
      this.active = Boolean(event.data?.active);
      if (!this.active) this.reset();
    };
  }

  reset() {
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.frameOffset = 0;
  }

  process(inputs) {
    if (!this.active) return true;
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const sample of channel) {
      this.sum += sample;
      this.count += 1;
      this.phase += 1;
      if (this.phase < this.ratio) continue;
      const averaged = Math.max(-1, Math.min(1, this.sum / this.count));
      this.frame[this.frameOffset++] = averaged < 0 ? averaged * 32768 : averaged * 32767;
      this.phase -= this.ratio;
      this.sum = 0;
      this.count = 0;
      if (this.frameOffset === this.frame.length) {
        const output = this.frame.buffer;
        this.port.postMessage(output, [output]);
        this.frame = new Int16Array(320);
        this.frameOffset = 0;
      }
    }
    return true;
  }
}

registerProcessor("ptt-capture", PttCaptureProcessor);
