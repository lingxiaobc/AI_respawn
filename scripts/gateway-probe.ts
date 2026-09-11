import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";
import { parsePcm16Wav, splitPcmFrames } from "../packages/audio/src/wav.ts";
import type { GatewayMessage } from "../packages/protocol/src/browser.ts";
import { diagnosticSession } from "./account-session.ts";

const account = await diagnosticSession("http://127.0.0.1:5173");
const library = await (await account.request("http://127.0.0.1:5173/api/avatars")).json();
const avatar = library.avatars?.find((a:{id:string;status:string})=>a.status==="ready"&&(!process.env.DIAGNOSTIC_AVATAR_ID||a.id===process.env.DIAGNOSTIC_AVATAR_ID));
if(!avatar){await account.logout();throw new Error("No authorized ready avatar for diagnostics");}
const socket = new WebSocket(`ws://127.0.0.1:5173/ws?avatar=${avatar.id}`, {
  origin: "http://127.0.0.1:5173",
  headers: { cookie: account.cookie },
});
socket.once("close",()=>{void account.logout().catch(()=>{});});
const fixture = parsePcm16Wav(await readFile("fixtures/input/test-utterance.wav"));
const frames = splitPcmFrames(fixture.pcm);
let outputBytes = 0;
let firstAudioAt = 0;
let committedAt = 0;
let asrCompleted = false;

function waitFor(predicate: (message: GatewayMessage) => boolean, timeoutMs = 60_000): Promise<GatewayMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for gateway state"));
    }, timeoutMs);
    const onMessage = (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) return;
      const message = JSON.parse(data.toString()) as GatewayMessage;
      if (message.type === "error") {
        clearTimeout(timer);
        socket.off("message", onMessage);
        reject(new Error(`${message.code}: ${message.message}`));
      } else if (predicate(message)) {
        clearTimeout(timer);
        socket.off("message", onMessage);
        resolve(message);
      }
    };
    socket.on("message", onMessage);
  });
}

socket.on("message", (data, isBinary) => {
  if (isBinary) {
    firstAudioAt ||= performance.now();
    outputBytes += Array.isArray(data)
      ? data.reduce((total, chunk) => total + chunk.byteLength, 0)
      : data.byteLength;
    return;
  }
  const message = JSON.parse(data.toString()) as GatewayMessage;
  if (message.type === "turn" && message.event === "asr.completed") asrCompleted = true;
});

await new Promise<void>((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
await waitFor((message) => message.type === "state" && message.state === "ready");
socket.send(JSON.stringify({ type: "ptt.start" }));
for (const frame of frames) {
  socket.send(frame, { binary: true });
  await delay(20);
}
committedAt = performance.now();
socket.send(JSON.stringify({ type: "ptt.commit" }));
await waitFor((message) => message.type === "turn" && message.event === "audio.done");
socket.send(JSON.stringify({ type: "playback.done" }));
await waitFor((message) => message.type === "state" && message.state === "ready", 75_000);

if (!asrCompleted || outputBytes === 0 || !firstAudioAt) throw new Error("Gateway response was incomplete");
console.log(JSON.stringify({
  type: "gateway-probe-summary",
  input_frames: frames.length,
  asr_completed: asrCompleted,
  output_pcm_bytes: outputBytes,
  commit_to_first_audio_ms: Math.round(firstAudioAt - committedAt),
  returned_to_ready: true,
}));
socket.send(JSON.stringify({ type: "session.close" }));
await new Promise<void>((resolve) => socket.once("close", () => resolve()));
