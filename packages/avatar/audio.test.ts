import test from "node:test";
import assert from "node:assert/strict";
import { AvatarAudioChunks, pcm16Wav } from "./src/audio.ts";

test("arbitrary network boundaries preserve resampling and sample count", () => {
  const input = Int16Array.from({ length: 24_001 }, (_, i) => Math.round(Math.sin(i / 11) * 20_000));
  const whole = new AvatarAudioChunks();
  const expected = [...whole.push(input.buffer), ...whole.finish()].flatMap(x => [...x]);
  const split = new AvatarAudioChunks();
  const result: number[] = [];
  for (let i = 0; i < input.length; i += 137) {
    result.push(...split.push(input.slice(i, i + 137).buffer).flatMap(x => [...x]));
  }
  result.push(...split.finish().flatMap(x => [...x]));
  assert.deepEqual(result, expected);
  assert.equal(result.length, 16_000);
});
test("finish flushes short replies and isolates the next round", () => {
  const queue = new AvatarAudioChunks();
  assert.deepEqual(queue.push(Int16Array.of(300, 600).buffer), []);
  assert.deepEqual([...queue.finish()[0]!], [400]);
  assert.deepEqual(queue.finish(), []);
  assert.deepEqual([...queue.push(Int16Array.of(0, 0, 0).buffer), ...queue.finish()].flatMap(x => [...x]), [0, 0]);
  assert.throws(() => queue.push(new ArrayBuffer(3)), /whole samples/);
});
test("WASM input is a valid little-endian mono WAV, including the last sample", () => {
  const wav = pcm16Wav(Int16Array.of(-32768, 0, 32767));
  const view = new DataView(wav);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint32(40, true), 6);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(48, true), 32767);
});
