import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePcm16Wav, splitPcmFrames } from "../packages/audio/src/wav.ts";

const input = resolve(process.argv[2] ?? "fixtures/input/test-utterance.wav");
const wav = parsePcm16Wav(await readFile(input));
const frames = splitPcmFrames(wav.pcm);
const durationMs = (wav.pcm.byteLength / 2 / wav.sampleRate) * 1_000;

console.log(
  JSON.stringify(
    {
      input,
      sampleRate: wav.sampleRate,
      channels: wav.channels,
      bitsPerSample: wav.bitsPerSample,
      pcmBytes: wav.pcm.byteLength,
      durationMs,
      frameBytes: 640,
      frames: frames.length,
    },
    null,
    2,
  ),
);
