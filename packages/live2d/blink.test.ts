import assert from "node:assert/strict";
import test from "node:test";
import { BlinkController, type BlinkTiming } from "./src/blink.ts";

const timing: BlinkTiming = {
  closeMs: 75,
  holdMs: 35,
  openMs: 90,
  minIntervalMs: 1_000,
  maxIntervalMs: 3_000,
};

test("blink closes, holds, and opens in 200 ms", () => {
  const blink = new BlinkController(0, () => 0, timing);
  assert.equal(blink.update(999), 1);
  assert.equal(blink.update(1_000), 1);
  assert.ok(blink.update(1_037.5) > 0.49 && blink.update(1_037.5) < 0.51);
  assert.equal(blink.update(1_075), 0);
  assert.equal(blink.update(1_109), 0);
  assert.ok(blink.update(1_155) > 0.49 && blink.update(1_155) < 0.51);
  assert.equal(blink.update(1_200), 1);
});

test("blink intervals vary with the supplied random source", () => {
  const values = [0, 1];
  const blink = new BlinkController(0, () => values.shift() ?? 0, timing);
  blink.update(1_000);
  blink.update(1_200);
  assert.equal(blink.update(4_199), 1);
  assert.equal(blink.update(4_200), 1);
  assert.ok(blink.update(4_275) <= 0.001);
});
