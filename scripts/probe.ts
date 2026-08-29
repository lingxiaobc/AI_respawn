import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { encodePcm16Wav, parsePcm16Wav, splitPcmFrames } from "../packages/audio/src/wav.ts";
import { DoubaoRealtimeClient } from "../packages/provider-doubao/src/client.ts";
import { safeEventSummary, type ServerEvent } from "../packages/provider-doubao/src/protocol.ts";
import { loadLocalEnv } from "./env.ts";

await loadLocalEnv();

const apiKey = process.env.DOUBAO_API_KEY?.trim();
if (!apiKey) {
  console.error("Gate 1 paused: set DOUBAO_API_KEY in the untracked .env file before running the probe.");
  process.exitCode = 2;
} else {
  const fixturePath = resolve(process.argv[2] ?? "fixtures/input/test-utterance.wav");
  const wav = parsePcm16Wav(await readFile(fixturePath));
  const frames = splitPcmFrames(wav.pcm);
  const outputChunks: Buffer[] = [];
  const startedAt = performance.now();
  let committedAt = 0;
  let firstAudioAt = 0;

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

  client.addEventListener("provider-event", (raw) => {
    const event = (raw as CustomEvent<ServerEvent>).detail;
    console.log(JSON.stringify({ t_ms: Math.round(performance.now() - startedAt), ...safeEventSummary(event) }));
  });
  client.addEventListener("provider-audio", (raw) => {
    if (!firstAudioAt) firstAudioAt = performance.now();
    outputChunks.push(Buffer.from((raw as CustomEvent<Uint8Array>).detail));
  });
  client.addEventListener("client-error", (raw) => {
    const error = (raw as CustomEvent<Error>).detail;
    console.error(JSON.stringify({ type: "client-error", message: error.message }));
  });

  try {
    await client.connect();
    client.unmute();
    for (const frame of frames) {
      client.appendAudio(frame);
      await delay(20);
    }
    committedAt = performance.now();
    client.commitTurn();
    await client.waitFor("response.output_audio.done", 60_000);
    await client.waitFor("response.done", 15_000).catch(() => undefined);

    const outputPcm = Buffer.concat(outputChunks);
    if (outputPcm.byteLength === 0) throw new Error("Provider completed without output PCM");
    await mkdir("artifacts", { recursive: true });
    const outputPath = resolve("artifacts/probe-output.wav");
    await writeFile(outputPath, encodePcm16Wav(outputPcm, 24_000));
    console.log(
      JSON.stringify({
        type: "probe-summary",
        input_frames: frames.length,
        output_pcm_bytes: outputPcm.byteLength,
        commit_to_first_audio_ms: firstAudioAt ? Math.round(firstAudioAt - committedAt) : null,
        output: outputPath,
      }),
    );
  } finally {
    await client.close();
  }
}
