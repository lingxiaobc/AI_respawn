import assert from "node:assert/strict";
import test from "node:test";
import { AudioEnvelopeFollower, calculateRms, rmsToMouthOpen } from "./src/envelope.ts";

test("RMS and mouth mapping reject silence and scale speech", () => {
  assert.equal(calculateRms(new Float32Array(32)), 0);
  assert.equal(rmsToMouthOpen(0.01), 0);
  assert.ok(rmsToMouthOpen(0.08) > 0.4);
  assert.equal(rmsToMouthOpen(0.135), 1);
});

test("envelope attacks faster than it releases and returns closed", () => {
  const envelope = new AudioEnvelopeFollower({ attackMs: 40, releaseMs: 120 });
  const opened = envelope.update(1, 40);
  assert.ok(opened > 0.6);
  const firstRelease = envelope.update(0, 40);
  assert.ok(firstRelease > 0.4);
  for (let index = 0; index < 80; index += 1) envelope.update(0, 16);
  assert.equal(envelope.value, 0);
});
