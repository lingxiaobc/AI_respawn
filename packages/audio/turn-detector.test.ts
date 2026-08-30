import assert from "node:assert/strict";
import test from "node:test";
import { TurnDetector, pcm16Rms } from "./src/turn-detector.ts";

const frame = (amplitude: number) => new Int16Array(320).fill(amplitude);
const quiet = frame(0);
const voice = frame(4_000);

test("initial silence never ends a turn", () => {
  const detector = new TurnDetector();
  for (let index = 0; index < 100; index += 1) assert.deepEqual(detector.push(quiet), []);
  assert.equal(detector.state, "waiting");
});

test("long silence remains locally armed without opening a turn", () => {
  const detector = new TurnDetector();
  for (let index = 0; index < 4_500; index += 1) assert.deepEqual(detector.push(quiet), []);
  assert.equal(detector.state, "waiting");
});

test("short noise is ignored until speech reaches the minimum duration", () => {
  const detector = new TurnDetector();
  for (let index = 0; index < 9; index += 1) assert.deepEqual(detector.push(voice), []);
  assert.deepEqual(detector.push(voice), ["speech-start"]);
  assert.equal(detector.state, "speaking");
});

test("silence commits exactly once after 1200 ms", () => {
  const detector = new TurnDetector();
  for (let index = 0; index < 10; index += 1) detector.push(voice);
  for (let index = 0; index < 59; index += 1) assert.deepEqual(detector.push(quiet), []);
  assert.deepEqual(detector.push(quiet), ["turn-end"]);
  assert.equal(detector.state, "waiting");
  assert.deepEqual(detector.push(quiet), []);
});

test("speech during silence wait cancels the pending end", () => {
  const detector = new TurnDetector();
  for (let index = 0; index < 10; index += 1) detector.push(voice);
  for (let index = 0; index < 20; index += 1) detector.push(quiet);
  assert.equal(detector.state, "silence");
  assert.deepEqual(detector.push(voice), []);
  assert.equal(detector.state, "speaking");
  for (let index = 0; index < 59; index += 1) assert.deepEqual(detector.push(quiet), []);
  assert.deepEqual(detector.push(quiet), ["turn-end"]);
});

test("a continuous turn is capped at the configured maximum", () => {
  const detector = new TurnDetector({ maxTurnDurationMs: 300 });
  for (let index = 0; index < 10; index += 1) {
    const events = detector.push(voice);
    assert.deepEqual(events, index === 9 ? ["speech-start"] : []);
  }
  for (let index = 0; index < 4; index += 1) assert.deepEqual(detector.push(voice), []);
  assert.deepEqual(detector.push(voice), ["turn-end"]);
});

test("PCM RMS is normalized and finite", () => {
  assert.equal(pcm16Rms(new Int16Array()), 0);
  assert.ok(Math.abs(pcm16Rms(new Int16Array([32767, -32768])) - 1) < 0.001);
});

test("invalid RMS and duration are rejected", () => {
  const detector = new TurnDetector();
  assert.throws(() => detector.pushRms(Number.NaN), /RMS/);
  assert.throws(() => detector.pushRms(0, 0), /duration/);
});
