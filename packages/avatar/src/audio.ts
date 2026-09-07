/** Stateful 24 kHz -> 16 kHz area resampler. Never reset at network boundaries. */
export class AvatarAudioChunks {
  #tail: number[] = [];
  #pending: number[] = [];
  readonly chunkSamples: number;
  constructor(chunkSamples = 5_120) {
    if (!Number.isInteger(chunkSamples) || chunkSamples < 1) throw new Error("Invalid chunk size");
    this.chunkSamples = chunkSamples;
  }
  push(bytes: ArrayBuffer): Int16Array[] {
    if (bytes.byteLength % 2) throw new Error("PCM16 must have whole samples");
    const input = new DataView(bytes);
    const ready: Int16Array[] = [];
    for (let offset = 0; offset < bytes.byteLength; offset += 2) {
      this.#tail.push(input.getInt16(offset, true));
      if (this.#tail.length === 3) {
        const [a, b, c] = this.#tail as [number, number, number];
        this.#pending.push(Math.round((2 * a + b) / 3), Math.round((b + 2 * c) / 3));
        this.#tail = [];
      }
      while (this.#pending.length >= this.chunkSamples) {
        ready.push(Int16Array.from(this.#pending.splice(0, this.chunkSamples)));
      }
    }
    return ready;
  }
  finish(): Int16Array[] {
    if (this.#tail.length === 2) this.#pending.push(Math.round((2 * this.#tail[0]! + this.#tail[1]!) / 3));
    const last = this.#pending.length ? [Int16Array.from(this.#pending)] : [];
    this.reset();
    return last;
  }
  reset(): void { this.#tail = []; this.#pending = []; }
}

export function pcm16Wav(samples: Int16Array, rate = 16_000): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true);
  text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, sample, true));
  return buffer;
}
