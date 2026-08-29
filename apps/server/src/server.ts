import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { DoubaoRealtimeClient } from "../../../packages/provider-doubao/src/client.ts";
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

function isAllowedOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  return origin === "http://127.0.0.1:5173" || origin === "http://localhost:5173";
}

class BrowserSession {
  readonly #browser: WebSocket;
  readonly #provider: DoubaoRealtimeClient;
  #state: GatewayState = "connecting";
  #round = 0;
  #responseDone = false;
  #playbackDone = false;
  #closed = false;

  constructor(browser: WebSocket) {
    this.#browser = browser;
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
    this.#provider.addEventListener("provider-event", (raw) => {
      this.#onProviderEvent((raw as CustomEvent<ServerEvent>).detail);
    });
    this.#provider.addEventListener("client-error", (raw) => {
      const error = (raw as CustomEvent<Error>).detail;
      this.#fail("UPSTREAM_CLIENT", error.message);
    });
    browser.on("message", (data, isBinary) => this.#onBrowserMessage(data, isBinary));
    browser.once("close", () => void this.close());
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
    if (this.#browser.readyState === WebSocket.OPEN) this.#browser.close(1000, "session closed");
  }

  #onBrowserMessage(data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean): void {
    try {
      if (isBinary) {
        const pcm = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (this.#state !== "listening") throw new Error("Audio is only accepted while listening");
        if (pcm.byteLength !== INPUT_FRAME_BYTES) throw new Error("Input frame must be exactly 640 bytes");
        this.#provider.appendAudio(pcm);
        return;
      }

      const control = parseBrowserControl(Buffer.from(data as ArrayBuffer).toString("utf8"));
      if (control.type === "ptt.start") {
        if (this.#state !== "ready") throw new Error(`Cannot start PTT from ${this.#state}`);
        this.#round += 1;
        this.#responseDone = false;
        this.#playbackDone = false;
        this.#provider.unmute();
        this.#transition("listening");
      } else if (control.type === "ptt.commit") {
        if (this.#state !== "listening") throw new Error(`Cannot commit PTT from ${this.#state}`);
        this.#provider.commitTurn();
        this.#transition("thinking");
      } else if (control.type === "playback.done") {
        if (this.#state !== "speaking") throw new Error(`Playback cannot finish from ${this.#state}`);
        this.#playbackDone = true;
        this.#maybeReady();
      } else {
        void this.close();
      }
    } catch (error) {
      this.#fail("INVALID_BROWSER_EVENT", error instanceof Error ? error.message : "Invalid browser event");
    }
  }

  #onProviderEvent(event: ServerEvent): void {
    if (event.type === "error") {
      const summary = safeEventSummary(event);
      this.#fail("UPSTREAM_EVENT", summary.message ?? "Provider returned an error");
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      this.#sendJson({ type: "turn", event: "asr.completed", round: this.#round });
    }
    if (event.type === "response.output_audio.delta" && typeof event.delta === "string") {
      if (this.#state === "thinking") this.#transition("speaking");
      const pcm = Buffer.from(event.delta, "base64");
      if (this.#browser.bufferedAmount > MAX_BUFFERED_BYTES) {
        this.#fail("BROWSER_BACKPRESSURE", "Browser audio queue exceeded 1 MiB");
        return;
      }
      if (this.#browser.readyState === WebSocket.OPEN) this.#browser.send(pcm, { binary: true });
    }
    if (event.type === "response.output_audio.done") {
      this.#sendJson({ type: "turn", event: "audio.done", round: this.#round });
    }
    if (event.type === "response.done") {
      this.#responseDone = true;
      this.#sendJson({ type: "turn", event: "response.done", round: this.#round });
      this.#maybeReady();
    }
  }

  #maybeReady(): void {
    if (this.#state === "speaking" && this.#responseDone && this.#playbackDone) this.#transition("ready");
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
      this.#state = "error";
      this.#sendJson({ type: "error", state: "error", code, message });
    }
    void this.close();
  }

  #sendJson(message: GatewayMessage): void {
    if (this.#browser.readyState === WebSocket.OPEN) this.#browser.send(JSON.stringify(message));
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
  console.log(JSON.stringify({ type: "gateway-ready", url: `http://127.0.0.1:${PORT}` }));
});

function shutdown(): void {
  wss.clients.forEach((client) => client.close(1001, "server shutdown"));
  server.close(() => process.exit(0));
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
