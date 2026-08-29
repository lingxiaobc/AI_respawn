/**
 * Convert the provider's observed Float32LE PCM stream to the application's
 * canonical PCM16LE stream. The decoder is stateful because a provider delta
 * may end in the middle of a four-byte float sample.
 */
export function float32LeToPcm16Le(input: Uint8Array): Buffer {
  if (input.byteLength % 4 !== 0) {
    throw new Error("Float32LE PCM chunk is not aligned to four-byte samples");
  }

  const output = Buffer.alloc((input.byteLength / 4) * 2);
  const source = Buffer.from(input);
  for (let offset = 0; offset < source.byteLength; offset += 4) {
    const sample = source.readFloatLE(offset);
    if (!Number.isFinite(sample)) throw new Error("Float32LE PCM contains a non-finite sample");
    const clamped = Math.max(-1, Math.min(1, sample));
    const pcm16 = clamped < 0 ? Math.round(clamped * 32_768) : Math.round(clamped * 32_767);
    output.writeInt16LE(pcm16, (offset / 4) * 2);
  }
  return output;
}

export class StreamingFloat32PcmDecoder {
  #tail = Buffer.alloc(0);

  push(input: Uint8Array): Buffer {
    if (input.byteLength === 0 && this.#tail.byteLength === 0) return Buffer.alloc(0);
    const joined = Buffer.concat([this.#tail, Buffer.from(input)]);
    const completeBytes = joined.byteLength - (joined.byteLength % 4);
    this.#tail = Buffer.from(joined.subarray(completeBytes));
    if (completeBytes === 0) return Buffer.alloc(0);
    return float32LeToPcm16Le(joined.subarray(0, completeBytes));
  }

  finish(): void {
    if (this.#tail.byteLength !== 0) {
      throw new Error("Float32LE PCM stream ended with an incomplete sample");
    }
  }
}
