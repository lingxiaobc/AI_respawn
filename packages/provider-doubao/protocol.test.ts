import assert from "node:assert/strict";
import test from "node:test";
import {
  createAudioAppendEvent,
  createCloseEvent,
  createCommitEvent,
  createMuteEvent,
  createSessionEvent,
  createUnmuteEvent,
  parseServerEvent,
  safeEventSummary,
} from "./src/protocol.ts";

test("session.create follows the verified Realtime 3.0 contract", () => {
  const event = createSessionEvent({ instructions: "test" });
  assert.equal(event.type, "session.create");
  assert.equal(event.session.model, "1.2.6.1");
  assert.deepEqual(event.session.audio.input.format, { type: "pcm", rate: 16_000 });
  assert.deepEqual(event.session.audio.output.format, { type: "pcm", rate: 24_000 });
  assert.deepEqual(event.extension, { asr: {}, tts: {}, dialog: {} });
});

test("audio frames are carried as base64 JSON fields", () => {
  const bytes = Uint8Array.from([0, 1, 2, 255]);
  const event = createAudioAppendEvent(bytes);
  assert.equal(event.type, "input_audio_buffer.append");
  assert.deepEqual(Buffer.from(event.audio, "base64"), Buffer.from(bytes));
});

test("PTT and shutdown event names remain explicit", () => {
  assert.equal(createUnmuteEvent().type, "input_audio_unmute.commit");
  assert.equal(createCommitEvent().type, "input_audio_buffer.commit");
  assert.equal(createMuteEvent().type, "input_audio_mute.commit");
  assert.equal(createCloseEvent().type, "session.close");
});

test("provider parsing rejects frames without a type", () => {
  assert.throws(() => parseServerEvent("{}"), /type field/);
  assert.equal(parseServerEvent('{"type":"session.created"}').type, "session.created");
});

test("safe summaries never echo audio base64", () => {
  const summary = safeEventSummary({
    type: "response.output_audio.delta",
    delta: Buffer.from([1, 2, 3]).toString("base64"),
  });
  assert.equal(summary.audio_bytes, 3);
  assert.equal("delta" in summary, false);
});

test("safe summaries preserve nested provider error diagnostics", () => {
  const summary = safeEventSummary({
    type: "error",
    event_id: "event_err",
    error: {
      type: "server_error",
      code: "input_audio_timeout",
      message: "input audio buffer timed out",
      param: "input_audio_buffer",
    },
  });
  assert.deepEqual(
    {
      type: summary.type,
      event_id: summary.event_id,
      error_type: summary.error_type,
      error_code: summary.error_code,
      error_param: summary.error_param,
      message: summary.message,
    },
    {
      type: "error",
      event_id: "event_err",
      error_type: "server_error",
      error_code: "input_audio_timeout",
      error_param: "input_audio_buffer",
      message: "input audio buffer timed out",
    },
  );
});
