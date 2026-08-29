import assert from "node:assert/strict";
import test from "node:test";
import { canTransition, parseBrowserControl } from "./src/browser.ts";

test("browser protocol accepts only known control messages", () => {
  assert.deepEqual(parseBrowserControl('{"type":"ptt.start"}'), { type: "ptt.start" });
  assert.throws(() => parseBrowserControl('{"type":"provider.raw"}'), /not allowed/);
  assert.throws(() => parseBrowserControl("[]"), /missing type/);
});

test("gateway state machine blocks recording while speaking", () => {
  assert.equal(canTransition("ready", "listening"), true);
  assert.equal(canTransition("speaking", "listening"), false);
  assert.equal(canTransition("speaking", "ready"), true);
});

test("disconnect and interruption paths can always close safely", () => {
  assert.equal(canTransition("listening", "closing"), true);
  assert.equal(canTransition("thinking", "error"), true);
  assert.equal(canTransition("speaking", "closing"), true);
  assert.equal(canTransition("closed", "closing"), false);
});

test("pointer cancel and playback completion map to explicit controls", () => {
  assert.deepEqual(parseBrowserControl('{"type":"ptt.commit"}'), { type: "ptt.commit" });
  assert.deepEqual(parseBrowserControl('{"type":"playback.done"}'), { type: "playback.done" });
  assert.deepEqual(parseBrowserControl('{"type":"session.close"}'), { type: "session.close" });
});

test("browser diagnostics accept only bounded safe fields", () => {
  assert.deepEqual(
    parseBrowserControl('{"type":"client.diagnostic","code":"MICROPHONE_INIT","message":"permission denied"}'),
    { type: "client.diagnostic", code: "MICROPHONE_INIT", message: "permission denied" },
  );
  assert.throws(() => parseBrowserControl('{"type":"client.diagnostic","code":"bad code"}'), /code is invalid/);
});
