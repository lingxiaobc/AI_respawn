import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DiagnosticLogger } from "../packages/diagnostics/src/logger.ts";
import { createSessionIdentity } from "../packages/diagnostics/src/schema.ts";
import { encodePcm16Wav, parsePcm16Wav, splitPcmFrames } from "../packages/audio/src/wav.ts";
import { DoubaoRealtimeClient, type ProviderDiagnostic } from "../packages/provider-doubao/src/client.ts";
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
  const identity = createSessionIdentity();
  const diagnostics = new DiagnosticLogger({ directory: process.env.DIAGNOSTICS_DIR ?? resolve("logs"), retentionDays: 7 });
  let roundStartedAt = 0;
  let committedAt = 0;
  let firstAudioAt = 0;
  let outputChunkCount = 0;
  let lastProviderEventId: string | undefined;
  let providerLogId: string | undefined;
  let providerStatus: number | string | undefined;
  let succeeded = false;

  diagnostics.write({
    event: "session_started",
    component: "probe",
    diagnostic_id: identity.diagnosticId,
    session_id: identity.sessionId,
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

  client.addEventListener("provider-event", (raw) => {
    const event = (raw as CustomEvent<ServerEvent>).detail;
    if (typeof event.event_id === "string") lastProviderEventId = event.event_id;
    if (event.type === "error") {
      const summary = safeEventSummary(event);
      providerStatus = summary.status_code;
      diagnostics.write({
        event: "error",
        component: "probe",
        diagnostic_id: identity.diagnosticId,
        session_id: identity.sessionId,
        round: 1,
        code: "UPSTREAM_EVENT",
        message: summary.message ?? "Provider returned an error",
        provider_event_id: lastProviderEventId,
        provider_status: providerStatus,
      });
      console.error(JSON.stringify({ type: "provider-error", code: "UPSTREAM_EVENT", message: summary.message }));
    }
  });
  client.addEventListener("provider-audio", (raw) => {
    if (!firstAudioAt) firstAudioAt = performance.now();
    outputChunkCount += 1;
    outputChunks.push(Buffer.from((raw as CustomEvent<Uint8Array>).detail));
  });
  client.addEventListener("provider-diagnostic", (raw) => {
    const detail = (raw as CustomEvent<ProviderDiagnostic>).detail;
    if (detail.log_id) providerLogId = detail.log_id;
    if (detail.status_code !== undefined) providerStatus = detail.status_code;
  });
  client.addEventListener("client-error", (raw) => {
    const error = (raw as CustomEvent<Error>).detail;
    diagnostics.write({
      event: "error",
      component: "probe",
      diagnostic_id: identity.diagnosticId,
      session_id: identity.sessionId,
      round: 1,
      code: "CLIENT_ERROR",
      message: error.message,
      provider_event_id: lastProviderEventId,
      provider_logid: providerLogId,
      provider_status: providerStatus,
    });
    console.error(JSON.stringify({ type: "client-error", message: error.message }));
  });

  try {
    await client.connect();
    client.unmute();
    roundStartedAt = performance.now();
    diagnostics.write({
      event: "round_started",
      component: "probe",
      diagnostic_id: identity.diagnosticId,
      session_id: identity.sessionId,
      round: 1,
    });
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
        diagnostic_id: identity.diagnosticId,
        input_frames: frames.length,
        output_pcm_bytes: outputPcm.byteLength,
        output_chunks: outputChunkCount,
        commit_to_first_audio_ms: firstAudioAt ? Math.round(firstAudioAt - committedAt) : null,
        output: outputPath,
      }),
    );
    succeeded = true;
    diagnostics.write({
      event: "round_completed",
      component: "probe",
      diagnostic_id: identity.diagnosticId,
      session_id: identity.sessionId,
      round: 1,
      result: "ok",
      input_frames: frames.length,
      input_bytes: wav.pcm.byteLength,
      output_chunks: outputChunkCount,
      output_pcm_bytes: outputPcm.byteLength,
      commit_to_first_audio_ms: firstAudioAt ? Math.round(firstAudioAt - committedAt) : undefined,
      round_duration_ms: Math.round(performance.now() - roundStartedAt),
      provider_event_id: lastProviderEventId,
      provider_logid: providerLogId,
      provider_status: providerStatus,
    });
  } finally {
    await client.close();
    diagnostics.write({
      event: "session_closed",
      component: "probe",
      diagnostic_id: identity.diagnosticId,
      session_id: identity.sessionId,
      round: 1,
      result: succeeded ? "closed" : "error",
      provider_event_id: lastProviderEventId,
      provider_logid: providerLogId,
      provider_status: providerStatus,
    });
  }
}
