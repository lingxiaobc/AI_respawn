import assert from "node:assert/strict";
import test from "node:test";
import { downsampleAveraged, nextPlaybackStart } from "./src/resample.ts";

test("48 kHz capture is reduced to exact 16 kHz duration without clipping", () => {
  const input = Float32Array.from({ length: 48_000 }, (_, index) => Math.sin(2 * Math.PI * 440 * index / 48_000) * 0.8);
  const output = downsampleAveraged(input, 48_000, 16_000);
  assert.equal(output.length, 16_000);
  assert.ok(output.every((sample) => Math.abs(sample) <= 1));
  assert.ok(Math.max(...output.map(Math.abs)) > 0.7);
});

test("playback scheduling is monotonic and never overlaps queued audio", () => {
  assert.equal(nextPlaybackStart(10, 0), 10.035);
  assert.equal(nextPlaybackStart(10, 12), 12);
  assert.throws(() => nextPlaybackStart(-1, 0), /negative/);
});
