import { test } from "node:test";
import assert from "node:assert/strict";
import { AvatarPlayer } from "../../apps/web/src/avatar-player.ts";

test("avatar bridge rejects wrong origins/sources, premature, duplicate and stale completion", () => {
  let receive: (event: unknown) => void = () => {};
  const sent: Array<{ type: string; round: number }> = [];
  const events: string[] = [];
  const peer = { postMessage: (message: { type: string; round: number }) => sent.push(message) };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    addEventListener: (_: string, listener: typeof receive) => { receive = listener; },
    removeEventListener: () => {},
  } });
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "http://test" } });
  const player = new AvatarPlayer({ contentWindow: peer } as unknown as HTMLIFrameElement, event => events.push(event));
  const message = (type: string, round = 0, origin = "http://test", source: unknown = peer) =>
    receive({ origin, source, data: { source: "dh-live", type, round } });
  try {
    message("ready", 0, "http://wrong"); message("ready", 0, "http://test", {});
    assert.equal(player.ready, false);
    message("ready"); player.begin();
    const firstRound = sent.at(-1)!.round;
    message("done", firstRound);
    assert.deepEqual(events, ["ready"]);
    player.push(new Int16Array(8000).buffer); player.finish();
    assert.ok(sent.some(message => message.type === "audio"));
    message("done", firstRound); message("done", firstRound);
    assert.deepEqual(events, ["ready", "done"]);
    player.begin(); player.finish();
    message("done", firstRound);
    assert.equal(events.length, 2);
    message("error");
    assert.equal(player.ready, false);
    assert.deepEqual(events, ["ready", "done", "error", "done"]);
  } finally {
    player.dispose();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    if (previousLocation) Object.defineProperty(globalThis, "location", previousLocation); else Reflect.deleteProperty(globalThis, "location");
  }
});
