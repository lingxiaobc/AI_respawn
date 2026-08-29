import { createServer, type IncomingMessage } from "node:http";
import { resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { DiagnosticLogger } from "../../../packages/diagnostics/src/logger.ts";
import { createSessionIdentity as createIdentity } from "../../../packages/diagnostics/src/schema.ts";
import { DoubaoRealtimeClient, type ProviderDiagnostic } from "../../../packages/provider-doubao/src/client.ts";
import { safeEventSummary, type ServerEvent } from "../../../packages/provider-doubao/src/protocol.ts";
import {
  canTransition,
  parseBrowserControl,
  type GatewayMessage,
  type GatewayState,
} from "../../../packages/protocol/src/browser.ts";
import { loadLocalEnv } from "../../../scripts/env.ts";

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);
const MAX_BUFFERED_BYTES = 1_048_576;
const INPUT_FRAME_BYTES = 640;

await loadLocalEnv();
const apiKey = process.env.DOUBAO_API_KEY?.trim();
if (!apiKey) throw new Error("DOUBAO_API_KEY is required in the untracked .env file");
const diagnostics = new DiagnosticLogger({ directory: process.env.DIAGNOSTICS_DIR ?? resolve("logs"), retentionDays: 7 });

function isAllowedOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  return origin === "http://127.0.0.1:5173" || origin === "http://localhost:5173";
}

class BrowserSession {
  readonly #browser: WebSocket;
  readonly #provider: DoubaoRealtimeClient;
  readonly #sessionId: string;
  readonly #diagnosticId: string;
  #state: GatewayState = "connecting";
  #round = 0;
  #roundStartedAt = 0;
  #pttUpAt = 0;
  #firstProviderAudioAt = 0;
  #responseDoneAt = 0;
  #inputFrames = 0;
  #inputBytes = 0;
  #outputChunks = 0;
  #outputBytes = 0;
  #asrCompleted = false;
  #lastProviderEventId?: string;
  #providerLogId?: string;
  #providerStatus?: number | string;
  #responseDone = false;
  #playbackDone = false;
  #closed = false;
  #errorLogged = false;
  #browserCloseCode?: number;
  #browserCloseReason?: string;

  constructor(browser: WebSocket) {
    this.#browser = browser;
    const identity = createIdentity();
    this.#sessionId = identity.sessionId;
    this.#diagnosticId = identity.diagnosticId;
    this.#provider = new DoubaoRealtimeClient({
      apiKey: apiKey!,
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
    diagnostics.write({
      event: "session_started",
      component: "gateway",
      diagnostic_id: this.#diagnosticId,
      session_id: this.#sessionId,
    });
    this.#provider.addEventListener("provider-event", (raw) => {
      this.#onProviderEvent((raw as CustomEvent<ServerEvent>).detail);
    });
    this.#provider.addEventListener("provider-audio", (raw) => {
      this.#onProviderAudio(raw);
    });
    this.#provider.addEventListener("client-error", (raw) => {
      const error = (raw as CustomEvent<Error>).detail;
      this.#fail("UPSTREAM_CLIENT", error.message);
    });
    this.#provider.addEventListener("provider-diagnostic", (raw) => {
      this.#onProviderDiagnostic((raw as CustomEvent<ProviderDiagnostic>).detail);
    });
    browser.on("message", (data, isBinary) => this.#onBrowserMessage(data, isBinary));
    browser.once("close", (code, reason) => {
      this.#browserCloseCode = code;
      this.#browserCloseReason = reason.toString("utf8").slice(0, 200) || undefined;
      void this.close();
    });
    browser.once("error", () => void this.close());
  }

  async start(): Promise<void> {
    this.#sendJson({ type: "state", state: "connecting" });
    try {
      await this.#provider.connect();
      this.#transition("ready");
    } catch (error) {
      this.#fail("UPSTREAM_CONNECT", error instanceof Error ? error.message : "Provider connection failed");
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (!["closing", "closed"].includes(this.#state)) this.#transition("closing");
    await this.#provider.close().catch(() => undefined);
    this.#state = "closed";
    this.#sendJson({ type: "state", state: "closed" });
    diagnostics.write({
      event: "session_closed",
      component: "gateway",
      diagnostic_id: this.#diagnosticId,
      session_id: this.#sessionId,
      round: this.#round || undefined,
      result: this.#errorLogged ? "error" : "closed",
      close_code: this.#browserCloseCode,
      close_reason: this.#browserCloseReason,
      provider_event_id: this.#lastProviderEventId,
      provider_logid: this.#providerLogId,
      provider_status: this.#providerStatus,
    });
    if (this.#browser.readyState === WebSocket.OPEN) this.#browser.close(1000, "session closed");
  }

  #onBrowserMessage(data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean): void {
    try {
      if (isBinary) {
        const pcm = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (this.#state !== "listening") throw new Error("Audio is only accepted while listening");
        if (pcm.byteLength !== INPUT_FRAME_BYTES) throw new Error("Input frame must be exactly 640 bytes");
        this.#inputFrames += 1;
        this.#inputBytes += pcm.byteLength;
        this.#provider.appendAudio(pcm);
        return;
      }

      const control = parseBrowserControl(Buffer.from(data as ArrayBuffer).toString("utf8"));
      if (control.type === "ptt.start") {
        if (this.#state !== "ready") throw new Error(`Cannot start PTT from ${this.#state}`);
        this.#round += 1;
        this.#roundStartedAt = performance.now();
        this.#pttUpAt = 0;
        this.#firstProviderAudioAt = 0;
        this.#responseDoneAt = 0;
        this.#inputFrames = 0;
        this.#inputBytes = 0;
        this.#outputChunks = 0;
        this.#outputBytes = 0;
        this.#asrCompleted = false;
        this.#responseDone = false;
        this.#playbackDone = false;
        diagnostics.write({
          event: "round_started",
          component: "gateway",
          diagnostic_id: this.#diagnosticId,
          session_id: this.#sessionId,
          round: this.#round,
        });
        this.#provider.unmute();
        this.#transition("listening");
      } else if (control.type === "ptt.commit") {
        if (this.#state !== "listening") throw new Error(`Cannot commit PTT from ${this.#state}`);
        this.#pttUpAt = performance.now();
        this.#provider.commitTurn();
        this.#transition("thinking");
      } else if (control.type === "playback.done") {
        if (this.#state !== "speaking") throw new Error(`Playback cannot finish from ${this.#state}`);
        this.#playbackDone = true;
        this.#maybeReady();
      } else if (control.type === "client.diagnostic") {
        diagnostics.write({
          event: "error",
          component: "browser",
          diagnostic_id: this.#diagnosticId,
          session_id: this.#sessionId,
          round: this.#round || undefined,
          state: this.#state,
          code: control.code,
          message: control.message,
        });
      } else {
        void this.close();
      }
    } catch (error) {
      this.#fail("INVALID_BROWSER_EVENT", error instanceof Error ? error.message : "Invalid browser event");
    }
  }

  #onProviderEvent(event: ServerEvent): void {
    if (typeof event.event_id === "string") this.#lastProviderEventId = event.event_id;
    if (event.type === "error") {
      const summary = safeEventSummary(event);
      this.#providerStatus = summary.status_code;
      this.#fail("UPSTREAM_EVENT", summary.message ?? "Provider returned an error");
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      this.#asrCompleted = true;
      this.#sendJson({ type: "turn", event: "asr.completed", round: this.#round });
    }
    if (event.type === "response.output_audio.done") {
      this.#sendJson({ type: "turn", event: "audio.done", round: this.#round });
    }
    if (event.type === "response.done") {
      this.#responseDone = true;
      this.#responseDoneAt = performance.now();
      this.#sendJson({ type: "turn", event: "response.done", round: this.#round });
      this.#maybeReady();
    }
  }

  #onProviderAudio(raw: Event): void {
    if (this.#state === "thinking") this.#transition("speaking");
    const pcm = Buffer.from((raw as CustomEvent<Uint8Array>).detail);
    this.#firstProviderAudioAt ||= performance.now();
    this.#outputChunks += 1;
    this.#outputBytes += pcm.byteLength;
    if (this.#browser.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.#fail("BROWSER_BACKPRESSURE", "Browser audio queue exceeded 1 MiB");
      return;
    }
    if (this.#browser.readyState === WebSocket.OPEN) this.#browser.send(pcm, { binary: true });
  }

  #maybeReady(): void {
    if (this.#state === "speaking" && this.#responseDone && this.#playbackDone) {
      const finishedAt = performance.now();
      this.#transition("ready");
      diagnostics.write({
        event: "round_completed",
        component: "gateway",
        diagnostic_id: this.#diagnosticId,
        session_id: this.#sessionId,
        round: this.#round,
        result: "ok",
        input_frames: this.#inputFrames,
        input_bytes: this.#inputBytes,
        output_chunks: this.#outputChunks,
        output_pcm_bytes: this.#outputBytes,
        asr_completed: this.#asrCompleted,
        commit_to_first_audio_ms: this.#pttUpAt && this.#firstProviderAudioAt
          ? Math.round(this.#firstProviderAudioAt - this.#pttUpAt)
          : undefined,
        round_duration_ms: this.#roundStartedAt ? Math.round(finishedAt - this.#roundStartedAt) : undefined,
        provider_event_id: this.#lastProviderEventId,
        provider_logid: this.#providerLogId,
        provider_status: this.#providerStatus,
      });
    }
  }

  #transition(next: GatewayState): void {
    if (next !== this.#state && !canTransition(this.#state, next)) {
      throw new Error(`Invalid gateway transition ${this.#state} -> ${next}`);
    }
    this.#state = next;
    this.#sendJson({ type: "state", state: next, round: this.#round || undefined });
  }

  #fail(code: string, message: string): void {
    if (this.#state !== "error" && !["closing", "closed"].includes(this.#state)) {
      this.#errorLogged = true;
      diagnostics.write({
        event: "error",
        component: "gateway",
        diagnostic_id: this.#diagnosticId,
        session_id: this.#sessionId,
        round: this.#round || undefined,
        state: this.#state,
        code,
        message,
        provider_event_id: this.#lastProviderEventId,
        provider_logid: this.#providerLogId,
        provider_status: this.#providerStatus,
      });
      this.#state = "error";
      this.#sendJson({ type: "error", state: "error", code, message });
    }
    void this.close();
  }

  #sendJson(message: GatewayMessage): void {
    if (this.#browser.readyState === WebSocket.OPEN) {
      this.#browser.send(JSON.stringify({ ...message, diagnostic_id: this.#diagnosticId }));
    }
  }

  #onProviderDiagnostic(detail: ProviderDiagnostic): void {
    if (detail.log_id) this.#providerLogId = detail.log_id;
    if (detail.status_code !== undefined) this.#providerStatus = detail.status_code;
  }
}

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  response.writeHead(404).end();
});
const wss = new WebSocketServer({ noServer: true, maxPayload: INPUT_FRAME_BYTES });

server.on("upgrade", (request, socket, head) => {
  if (request.url !== "/ws" || !isAllowedOrigin(request)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (browser) => wss.emit("connection", browser, request));
});

wss.on("connection", (browser) => {
  const session = new BrowserSession(browser);
  void session.start();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(JSON.stringify({ type: "gateway-ready", url: `http://127.0.0.1:${PORT}`, diagnostics_dir: diagnostics.directory }));
});

function shutdown(): void {
  wss.clients.forEach((client) => client.close(1001, "server shutdown"));
  server.close(() => process.exit(0));
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
