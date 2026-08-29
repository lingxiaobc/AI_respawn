export interface PcmWav {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Buffer;
}

function readFourCc(buffer: Buffer, offset: number): string {
  return buffer.toString("ascii", offset, offset + 4);
}

export function parsePcm16MonoWav(buffer: Buffer): PcmWav {
  if (buffer.byteLength < 44 || readFourCc(buffer, 0) !== "RIFF" || readFourCc(buffer, 8) !== "WAVE") {
    throw new Error("Fixture is not a RIFF/WAVE file");
  }

  let offset = 12;
  let format: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | undefined;
  let pcm: Buffer | undefined;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = readFourCc(buffer, offset);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkSize;
    if (end > buffer.byteLength) throw new Error(`WAV chunk ${chunkId} exceeds file length`);

    if (chunkId === "fmt ") {
      if (chunkSize < 16) throw new Error("WAV fmt chunk is too short");
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (chunkId === "data") {
      pcm = buffer.subarray(start, end);
    }
    offset = end + (chunkSize % 2);
  }

  if (!format || !pcm) throw new Error("WAV is missing fmt or data chunk");
  if (format.audioFormat !== 1) throw new Error("Fixture must use integer PCM encoding");
  if (format.channels !== 1 || format.bitsPerSample !== 16) {
    throw new Error(
      `Fixture must be mono PCM16; got ${format.channels}ch/${format.sampleRate}Hz/${format.bitsPerSample}bit`,
    );
  }
  if (pcm.byteLength % 2 !== 0) throw new Error("PCM16 data has an odd byte length");
  return { sampleRate: format.sampleRate, channels: format.channels, bitsPerSample: format.bitsPerSample, pcm };
}

export function parsePcm16Wav(buffer: Buffer): PcmWav {
  const wav = parsePcm16MonoWav(buffer);
  if (wav.sampleRate !== 16_000) {
    throw new Error(`Fixture must use a 16000 Hz sample rate; got ${wav.sampleRate} Hz`);
  }
  return wav;
}

export function encodePcm16Wav(pcm: Uint8Array, sampleRate: number, channels = 1): Buffer {
  if (pcm.byteLength % 2 !== 0) throw new Error("PCM16 data has an odd byte length");
  const bytes = Buffer.from(pcm);
  const output = Buffer.alloc(44 + bytes.byteLength);
  output.write("RIFF", 0, "ascii");
  output.writeUInt32LE(36 + bytes.byteLength, 4);
  output.write("WAVE", 8, "ascii");
  output.write("fmt ", 12, "ascii");
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(channels, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * channels * 2, 28);
  output.writeUInt16LE(channels * 2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36, "ascii");
  output.writeUInt32LE(bytes.byteLength, 40);
  bytes.copy(output, 44);
  return output;
}

export function splitPcmFrames(pcm: Uint8Array, frameBytes = 640): Buffer[] {
  if (frameBytes <= 0 || frameBytes % 2 !== 0) throw new Error("frameBytes must be a positive even number");
  const frames: Buffer[] = [];
  for (let offset = 0; offset < pcm.byteLength; offset += frameBytes) {
    const source = Buffer.from(pcm.subarray(offset, Math.min(offset + frameBytes, pcm.byteLength)));
    if (source.byteLength === frameBytes) {
      frames.push(source);
    } else {
      const padded = Buffer.alloc(frameBytes);
      source.copy(padded);
      frames.push(padded);
    }
  }
  return frames;
}

export function resamplePcm16Mono(pcm: Uint8Array, sourceRate: number, targetRate: number): Buffer {
  if (sourceRate <= 0 || targetRate <= 0) throw new Error("Sample rates must be positive");
  if (pcm.byteLength % 2 !== 0) throw new Error("PCM16 data has an odd byte length");
  if (sourceRate === targetRate) return Buffer.from(pcm);

  const input = new Int16Array(pcm.byteLength / 2);
  const bytes = Buffer.from(pcm);
  for (let index = 0; index < input.length; index += 1) input[index] = bytes.readInt16LE(index * 2);

  const outputLength = Math.max(1, Math.round(input.length * (targetRate / sourceRate)));
  const output = Buffer.alloc(outputLength * 2);
  const scale = sourceRate / targetRate;
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * scale;
    const left = Math.min(Math.floor(position), input.length - 1);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = position - left;
    const sample = Math.round(input[left] * (1 - fraction) + input[right] * fraction);
    output.writeInt16LE(Math.max(-32_768, Math.min(32_767, sample)), index * 2);
  }
  return output;
}
