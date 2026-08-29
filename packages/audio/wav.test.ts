import assert from "node:assert/strict";
import test from "node:test";
import {
  encodePcm16Wav,
  parsePcm16MonoWav,
  parsePcm16Wav,
  resamplePcm16Mono,
  splitPcmFrames,
} from "./src/wav.ts";

test("PCM16 WAV round-trips with the expected contract", () => {
  const pcm = Buffer.alloc(1_280);
  for (let index = 0; index < pcm.byteLength; index += 2) pcm.writeInt16LE(index / 2, index);
  const wav = encodePcm16Wav(pcm, 16_000);
  const parsed = parsePcm16Wav(wav);
  assert.equal(parsed.sampleRate, 16_000);
  assert.equal(parsed.channels, 1);
  assert.equal(parsed.bitsPerSample, 16);
  assert.deepEqual(parsed.pcm, pcm);
});

test("20 ms input frames are 640 bytes and the final frame is silence padded", () => {
  const frames = splitPcmFrames(Buffer.alloc(700, 1));
  assert.equal(frames.length, 2);
  assert.equal(frames[0].byteLength, 640);
  assert.equal(frames[1].byteLength, 640);
  assert.equal(frames[1][59], 1);
  assert.equal(frames[1][60], 0);
});

test("invalid fixture format is rejected before any provider call", () => {
  assert.throws(() => parsePcm16Wav(Buffer.from("not wav")), /RIFF\/WAVE/);
});

test("public 8 kHz PCM can be converted into the 16 kHz provider contract", () => {
  const source = Buffer.alloc(8_000 * 2);
  for (let index = 0; index < 8_000; index += 1) {
    source.writeInt16LE(Math.round(Math.sin((index / 8_000) * Math.PI * 2 * 440) * 10_000), index * 2);
  }
  const sourceWav = parsePcm16MonoWav(encodePcm16Wav(source, 8_000));
  const converted = resamplePcm16Mono(sourceWav.pcm, sourceWav.sampleRate, 16_000);
  assert.equal(converted.byteLength, 16_000 * 2);
  assert.equal(parsePcm16Wav(encodePcm16Wav(converted, 16_000)).sampleRate, 16_000);
});
