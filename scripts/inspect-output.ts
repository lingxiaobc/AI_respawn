import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePcm16MonoWav } from "../packages/audio/src/wav.ts";

const input = resolve(process.argv[2] ?? "artifacts/probe-output.wav");
const wav = parsePcm16MonoWav(await readFile(input));
if (wav.sampleRate !== 24_000) {
  throw new Error(`Provider output must be 24000 Hz; got ${wav.sampleRate} Hz`);
}
if (wav.pcm.byteLength === 0) throw new Error("Provider output WAV contains no PCM data");

let peak = 0;
let squared = 0;
const samples = wav.pcm.byteLength / 2;
for (let index = 0; index < samples; index += 1) {
  const sample = wav.pcm.readInt16LE(index * 2);
  peak = Math.max(peak, Math.abs(sample));
  squared += sample * sample;
}

const durationMs = (samples / wav.sampleRate) * 1_000;
const rms = Math.sqrt(squared / samples);
if (peak === 0 || rms === 0) throw new Error("Provider output WAV is digital silence");

console.log(
  JSON.stringify(
    {
      input,
      sampleRate: wav.sampleRate,
      channels: wav.channels,
      bitsPerSample: wav.bitsPerSample,
      pcmBytes: wav.pcm.byteLength,
      durationMs: Math.round(durationMs),
      peak,
      rms: Math.round(rms),
    },
    null,
    2,
  ),
);
