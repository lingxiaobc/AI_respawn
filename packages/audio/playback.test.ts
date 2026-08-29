import assert from "node:assert/strict";
import test from "node:test";
import { PcmPlaybackQueue, type PcmSink } from "./src/playback.ts";

test("playback queue retries partial writes without dropping or duplicating samples", async () => {
  const written: number[] = [];
  let firstWrites = 0;
  let flushes = 0;
  const sink: PcmSink = {
    write(pcm) {
      const samples = [...new Int16Array(pcm)];
      const accepted = samples.slice(0, 2);
      written.push(...accepted);
      return accepted.length;
    },
    flush() {
      flushes += 1;
      return 0;
    },
  };
  const queue = new PcmPlaybackQueue(sink, {
    retryDelayMs: 0,
    onFirstWrite: () => {
      firstWrites += 1;
    },
  });

  queue.enqueue(new Uint8Array(new Int16Array([1, 2, 3]).buffer));
  queue.enqueue(new Uint8Array(new Int16Array([4, 5]).buffer));
  await queue.finish();

  assert.deepEqual(written, [1, 2, 3, 4, 5]);
  assert.equal(firstWrites, 1);
  assert.equal(flushes, 1);
});

test("playback queue rejects unaligned PCM", () => {
  const sink: PcmSink = { write: () => 0, flush: () => 0 };
  const queue = new PcmPlaybackQueue(sink);
  assert.throws(() => queue.enqueue(new Uint8Array(3)), /aligned/);
});
