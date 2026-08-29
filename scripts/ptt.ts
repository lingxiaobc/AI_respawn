import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { PvRecorder } from "@picovoice/pvrecorder-node";
import { PvSpeaker } from "@picovoice/pvspeaker-node";
import { PcmPlaybackQueue } from "../packages/audio/src/playback.ts";
import { DoubaoRealtimeClient } from "../packages/provider-doubao/src/client.ts";
import { safeEventSummary, type ServerEvent } from "../packages/provider-doubao/src/protocol.ts";
import { loadLocalEnv } from "./env.ts";

const INPUT_SAMPLE_RATE = 16_000;
const OUTPUT_SAMPLE_RATE = 24_000;
const FRAME_LENGTH = 320;
const DEFAULT_ROUNDS = 5;

interface RoundMetrics {
  number: number;
  pttDownAt: number;
  pttUpAt?: number;
  firstProviderAudioAt?: number;
  firstPlaybackWriteAt?: number;
  inputFrames: number;
  inputBytes: number;
  inputPeak: number;
  outputBytes: number;
  asrCompleted: boolean;
}

function integerArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) throw new Error(`--${name} must be an integer`);
  return value;
}

function keyWatcher(): ChildProcessWithoutNullStreams {
  return spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve("scripts/space-key-events.ps1")],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
}

function pcmBuffer(frame: Int16Array): Buffer {
  return Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
}

await loadLocalEnv();
const apiKey = process.env.DOUBAO_API_KEY?.trim();
if (!apiKey) throw new Error("Set DOUBAO_API_KEY in the untracked .env file before running PTT");

const roundsTarget = integerArg("rounds", DEFAULT_ROUNDS);
const inputDevice = integerArg("input-device", -1);
const outputDevice = integerArg("output-device", -1);
if (roundsTarget < 1 || roundsTarget > 10) throw new Error("--rounds must be between 1 and 10");

const recorder = new PvRecorder(FRAME_LENGTH, inputDevice);
if (recorder.sampleRate !== INPUT_SAMPLE_RATE) {
  recorder.release();
  throw new Error(`Recorder returned ${recorder.sampleRate} Hz; ${INPUT_SAMPLE_RATE} Hz is required`);
}
const speaker = new PvSpeaker(OUTPUT_SAMPLE_RATE, 16, {
  deviceIndex: outputDevice,
  bufferSizeSecs: 5,
});
const client = new DoubaoRealtimeClient({
  apiKey,
  url: process.env.DOUBAO_WS_URL,
  session: {
    model: process.env.DOUBAO_MODEL,
    voice: process.env.DOUBAO_VOICE,
    instructions:
      process.env.DOUBAO_INSTRUCTIONS ??
      "你是一位温和、简洁的中文语音助手。每次回答不超过两句话。",
  },
  timeoutMs: 45_000,
});

let active: RoundMetrics | undefined;
let playback: PcmPlaybackQueue | undefined;
let capture: Promise<void> | undefined;
let roundsCompleted = 0;
let state: "connecting" | "ready" | "listening" | "thinking" | "speaking" | "closing" = "connecting";
let operations = Promise.resolve();

client.addEventListener("provider-event", (raw) => {
  const event = (raw as CustomEvent<ServerEvent>).detail;
  if (event.type === "conversation.item.input_audio_transcription.completed" && active) {
    active.asrCompleted = true;
  }
  if (event.type === "error") console.error(JSON.stringify(safeEventSummary(event)));
});

client.addEventListener("provider-audio", (raw) => {
  if (!active || !playback) return;
  const pcm = Buffer.from((raw as CustomEvent<Uint8Array>).detail);
  active.firstProviderAudioAt ??= performance.now();
  active.outputBytes += pcm.byteLength;
  playback.enqueue(pcm);
  state = "speaking";
});

client.addEventListener("client-error", (raw) => {
  const error = (raw as CustomEvent<Error>).detail;
  console.error(JSON.stringify({ type: "client-error", message: error.message }));
});

async function startRound(): Promise<void> {
  if (state !== "ready" || active) {
    console.log(`忽略按下：当前状态为 ${state}`);
    return;
  }
  active = {
    number: roundsCompleted + 1,
    pttDownAt: performance.now(),
    inputFrames: 0,
    inputBytes: 0,
    inputPeak: 0,
    outputBytes: 0,
    asrCompleted: false,
  };
  const metrics = active;
  playback = new PcmPlaybackQueue(speaker, {
    onFirstWrite: () => {
      metrics.firstPlaybackWriteAt ??= performance.now();
    },
  });
  client.unmute();
  recorder.start();
  state = "listening";
  console.log(`第 ${metrics.number}/${roundsTarget} 轮：正在聆听，松开空格提交。`);

  capture = (async () => {
    try {
      while (state === "listening") {
        const frame = await recorder.read();
        if (state !== "listening") break;
        const pcm = pcmBuffer(frame);
        client.appendAudio(pcm);
        metrics.inputFrames += 1;
        metrics.inputBytes += pcm.byteLength;
        for (const sample of frame) metrics.inputPeak = Math.max(metrics.inputPeak, Math.abs(sample));
      }
    } catch (error) {
      if (state === "listening") throw error;
    }
  })();
}

async function finishRound(): Promise<void> {
  if (state !== "listening" || !active || !playback) return;
  const metrics = active;
  metrics.pttUpAt = performance.now();
  state = "thinking";
  recorder.stop();
  await capture;
  if (metrics.inputFrames === 0 || metrics.inputPeak === 0) {
    throw new Error("No non-silent microphone frames were captured");
  }

  const audioDone = client.waitFor("response.output_audio.done", 60_000);
  const responseDone = client.waitFor("response.done", 70_000);
  client.commitTurn();
  console.log(`第 ${metrics.number}/${roundsTarget} 轮：已提交 ${metrics.inputFrames} 帧，等待并播放回复。`);
  await audioDone;
  await responseDone;
  await playback.finish();

  const providerLatency = metrics.firstProviderAudioAt
    ? Math.round(metrics.firstProviderAudioAt - metrics.pttUpAt)
    : null;
  const playbackLatency = metrics.firstPlaybackWriteAt
    ? Math.round(metrics.firstPlaybackWriteAt - metrics.pttUpAt)
    : null;
  console.log(
    JSON.stringify({
      type: "ptt-round-summary",
      round: metrics.number,
      input_frames: metrics.inputFrames,
      input_bytes: metrics.inputBytes,
      input_peak: metrics.inputPeak,
      asr_completed: metrics.asrCompleted,
      output_pcm_bytes: metrics.outputBytes,
      ptt_up_to_provider_audio_ms: providerLatency,
      ptt_up_to_playback_write_ms: playbackLatency,
    }),
  );
  roundsCompleted += 1;
  active = undefined;
  playback = undefined;
  capture = undefined;
  state = roundsCompleted >= roundsTarget ? "closing" : "ready";
  if (state === "ready") console.log("下一轮：按住空格说话。按 Esc 可提前退出。\n");
}

const watcher = keyWatcher();
watcher.stderr.on("data", (chunk) => console.error(chunk.toString("utf8").trim()));

try {
  console.log(`输入设备：${recorder.getSelectedDevice()}`);
  console.log(`输出设备：${speaker.getSelectedDevice()}`);
  await client.connect();
  speaker.start();
  state = "ready";
  console.log(`已连接。共测试 ${roundsTarget} 轮：按住空格说普通话，松开提交；按 Esc 提前退出。\n`);

  const lines = createInterface({ input: watcher.stdout });
  for await (const line of lines) {
    const event = line.trim();
    if (event === "quit") break;
    operations = operations.then(event === "down" ? startRound : finishRound);
    await operations;
    if (roundsCompleted >= roundsTarget) break;
  }
} finally {
  state = "closing";
  if (recorder.isRecording) recorder.stop();
  watcher.kill();
  await operations.catch(() => undefined);
  await client.close();
  if (speaker.isStarted) speaker.stop();
  speaker.release();
  recorder.release();
}

if (roundsCompleted < roundsTarget) {
  console.log(`PTT 提前结束：完成 ${roundsCompleted}/${roundsTarget} 轮。`);
  process.exitCode = 2;
} else {
  console.log(`PTT 本机验证完成：${roundsCompleted}/${roundsTarget} 轮。`);
}
