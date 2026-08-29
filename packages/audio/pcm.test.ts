import assert from "node:assert/strict";
import test from "node:test";
import { float32LeToPcm16Le, StreamingFloat32PcmDecoder } from "./src/pcm.ts";

function floatBytes(values: number[]): Buffer {
  const output = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => output.writeFloatLE(value, index * 4));
  return output;
}

function int16Values(bytes: Uint8Array): number[] {
  const source = Buffer.from(bytes);
  const values: number[] = [];
  for (let offset = 0; offset < source.byteLength; offset += 2) values.push(source.readInt16LE(offset));
  return values;
}

test("Float32LE conversion clamps and emits canonical PCM16LE", () => {
  const converted = float32LeToPcm16Le(floatBytes([-2, -1, -0.5, 0, 0.5, 1, 2]));
  assert.deepEqual(int16Values(converted), [-32768, -32768, -16384, 0, 16384, 32767, 32767]);
});

test("streaming decoder preserves samples split across deltas", () => {
  const source = floatBytes([0.1, -0.2, 0.3]);
  const decoder = new StreamingFloat32PcmDecoder();
  const output = Buffer.concat([
    decoder.push(source.subarray(0, 3)),
    decoder.push(source.subarray(3, 8)),
    decoder.push(source.subarray(8)),
  ]);
  decoder.finish();
  assert.deepEqual(int16Values(output), [3277, -6554, 9830]);
});

test("streaming decoder rejects incomplete sample at end of stream", () => {
  const decoder = new StreamingFloat32PcmDecoder();
  decoder.push(Uint8Array.from([0, 0, 0]));
  assert.throws(() => decoder.finish(), /incomplete sample/);
});

test("conversion rejects non-finite samples", () => {
  assert.throws(() => float32LeToPcm16Le(floatBytes([Number.NaN])), /non-finite/);
});
