import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  encodePcm16Wav,
  parsePcm16MonoWav,
  resamplePcm16Mono,
} from "../packages/audio/src/wav.ts";

const sourceNames = ["0_jackson_0.wav", "1_jackson_0.wav", "2_jackson_0.wav"];
const targetRate = 16_000;
const silence = Buffer.alloc(Math.round(targetRate * 0.25) * 2);
const segments: Buffer[] = [];

for (const name of sourceNames) {
  const source = parsePcm16MonoWav(await readFile(resolve("fixtures/source/fsdd", name)));
  segments.push(resamplePcm16Mono(source.pcm, source.sampleRate, targetRate), silence);
}

const pcm = Buffer.concat(segments);
await mkdir("fixtures/input", { recursive: true });
const output = resolve("fixtures/input/test-utterance.wav");
await writeFile(output, encodePcm16Wav(pcm, targetRate));
console.log(JSON.stringify({ output, sampleRate: targetRate, pcmBytes: pcm.byteLength }));
