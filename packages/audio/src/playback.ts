import { setTimeout as delay } from "node:timers/promises";

export interface PcmSink {
  write(pcm: ArrayBuffer): number;
  flush(): number;
}

export interface PlaybackQueueOptions {
  bytesPerSample?: number;
  retryDelayMs?: number;
  onFirstWrite?: () => void;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export class PcmPlaybackQueue {
  readonly #sink: PcmSink;
  readonly #bytesPerSample: number;
  readonly #retryDelayMs: number;
  readonly #onFirstWrite?: () => void;
  #tail: Promise<void> = Promise.resolve();
  #firstWriteReported = false;
  #closed = false;

  constructor(sink: PcmSink, options: PlaybackQueueOptions = {}) {
    this.#sink = sink;
    this.#bytesPerSample = options.bytesPerSample ?? 2;
    this.#retryDelayMs = options.retryDelayMs ?? 10;
    this.#onFirstWrite = options.onFirstWrite;
  }

  enqueue(pcm: Uint8Array): void {
    if (this.#closed) throw new Error("Playback queue is already closed");
    if (pcm.byteLength === 0) return;
    if (pcm.byteLength % this.#bytesPerSample !== 0) {
      throw new Error("PCM chunk is not aligned to a complete sample");
    }
    const owned = new Uint8Array(pcm.byteLength);
    owned.set(pcm);
    this.#tail = this.#tail.then(() => this.#writeAll(owned));
  }

  async finish(): Promise<void> {
    this.#closed = true;
    await this.#tail;
    this.#sink.flush();
  }

  async #writeAll(pcm: Uint8Array): Promise<void> {
    let byteOffset = 0;
    while (byteOffset < pcm.byteLength) {
      const remaining = pcm.subarray(byteOffset);
      const writtenSamples = this.#sink.write(copyToArrayBuffer(remaining));
      if (writtenSamples < 0 || writtenSamples * this.#bytesPerSample > remaining.byteLength) {
        throw new Error("PCM sink returned an invalid write length");
      }
      if (writtenSamples === 0) {
        await delay(this.#retryDelayMs);
        continue;
      }
      if (!this.#firstWriteReported) {
        this.#firstWriteReported = true;
        this.#onFirstWrite?.();
      }
      byteOffset += writtenSamples * this.#bytesPerSample;
    }
  }
}
