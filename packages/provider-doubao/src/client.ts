import WebSocket from "ws";
import { StreamingFloat32PcmDecoder } from "../../audio/src/pcm.ts";
import {
  createAudioAppendEvent,
  createCloseEvent,
  createCommitEvent,
  createMuteEvent,
  createSessionEvent,
  createUnmuteEvent,
  DEFAULT_DOUBAO_URL,
  parseServerEvent,
  safeEventSummary,
  type ServerEvent,
  type SessionConfig,
} from "./protocol.ts";

export interface DoubaoClientOptions {
  apiKey: string;
  url?: string;
  session: SessionConfig;
  timeoutMs?: number;
}

export interface ProviderDiagnostic {
  kind: "handshake_rejected" | "socket_error" | "socket_closed" | "event_sent" | "close_timeout";
  status_code?: number;
  log_id?: string;
  close_code?: number;
  close_reason?: string;
  message?: string;
  event_type?: string;
  event_id?: string;
  event_size_bytes?: number;
  direction?: "inbound" | "outbound";
}

export class DoubaoRealtimeClient extends EventTarget {
  readonly #options: DoubaoClientOptions;
  #socket?: WebSocket;
  #sessionCreated = false;
  #closed = false;
  #outputDecoder = new StreamingFloat32PcmDecoder();

  constructor(options: DoubaoClientOptions) {
    super();
    if (!options.apiKey.trim()) throw new Error("DOUBAO_API_KEY is empty");
    this.#options = options;
  }

  get ready(): boolean {
    return this.#sessionCreated && this.#socket?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.#socket) throw new Error("Client has already been connected");

    const socket = new WebSocket(this.#options.url ?? DEFAULT_DOUBAO_URL, {
      headers: { "X-Api-Key": this.#options.apiKey },
    });
    this.#socket = socket;

    await this.#waitForOpen(socket);
    this.#wireMessages(socket);
    this.#send(createSessionEvent(this.#options.session));
    await this.waitFor("session.created");
    this.#sessionCreated = true;
    this.#send(createMuteEvent());
  }

  unmute(): void {
    this.#requireReady();
    this.#send(createUnmuteEvent());
  }

  appendAudio(pcm: Uint8Array): void {
    this.#requireReady();
    if (pcm.byteLength === 0) throw new Error("Cannot send an empty audio frame");
    this.#send(createAudioAppendEvent(pcm), false);
  }

  commitTurn(): void {
    this.#requireReady();
    this.#send(createCommitEvent());
    this.#send(createMuteEvent());
  }

  async close(): Promise<void> {
    if (!this.#socket || this.#closed) return;
    const socket = this.#socket;

    if (socket.readyState === WebSocket.OPEN && this.#sessionCreated) {
      this.#send(createCloseEvent());
      try {
        await this.waitFor("session.closed", Math.min(this.#options.timeoutMs ?? 30_000, 5_000));
      } catch (error) {
        this.dispatchEvent(new CustomEvent<ProviderDiagnostic>("provider-diagnostic", {
          detail: {
            kind: "close_timeout",
            message: error instanceof Error ? error.message : "Timed out waiting for session.closed",
          },
        }));
      }
    }
    this.#closed = true;
    socket.close(1000, "client shutdown");
  }

  waitFor(type: string, timeoutMs = this.#options.timeoutMs ?? 30_000): Promise<ServerEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeEventListener("provider-event", onEvent);
        reject(new Error(`Timed out waiting for ${type}`));
      }, timeoutMs);

      const onEvent = (raw: Event) => {
        const event = (raw as CustomEvent<ServerEvent>).detail;
        if (event.type === "error") {
          clearTimeout(timer);
          this.removeEventListener("provider-event", onEvent);
          const summary = safeEventSummary(event);
          const details = [summary.error_code, summary.error_type, summary.message].filter(Boolean).join(" ");
          reject(new Error(`Provider error while waiting for ${type}${details ? `: ${details}` : ""}`));
          return;
        }
        if (event.type !== type) return;
        clearTimeout(timer);
        this.removeEventListener("provider-event", onEvent);
        resolve(event);
      };
      this.addEventListener("provider-event", onEvent);
    });
  }

  #requireReady(): void {
    if (!this.ready) throw new Error("Provider session is not ready");
  }

  #send(value: unknown, trace = true): void {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
      throw new Error("Provider WebSocket is not open");
    }
    const payload = JSON.stringify(value);
    this.#socket.send(payload);
    if (trace && value && typeof value === "object") {
      const candidate = value as { type?: unknown; event_id?: unknown };
      this.dispatchEvent(new CustomEvent<ProviderDiagnostic>("provider-diagnostic", {
        detail: {
          kind: "event_sent",
          direction: "outbound",
          event_type: typeof candidate.type === "string" ? candidate.type : undefined,
          event_id: typeof candidate.event_id === "string" ? candidate.event_id : undefined,
          event_size_bytes: Buffer.byteLength(payload, "utf8"),
        },
      }));
    }
  }

  #wireMessages(socket: WebSocket): void {
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        this.dispatchEvent(
          new CustomEvent("client-error", {
            detail: new Error("Provider unexpectedly returned a binary frame"),
          }),
        );
        return;
      }
      try {
        const event = parseServerEvent(data.toString("utf8"));
        this.dispatchEvent(new CustomEvent("provider-event", { detail: event }));
        if (event.type === "response.output_audio.delta" && typeof event.delta === "string") {
          try {
            const pcm = this.#outputDecoder.push(Buffer.from(event.delta, "base64"));
            if (pcm.byteLength > 0) {
              this.dispatchEvent(new CustomEvent("provider-audio", { detail: pcm }));
            }
          } catch (error) {
            this.dispatchEvent(new CustomEvent("client-error", { detail: error }));
          }
        }
        if (event.type === "response.output_audio.done") {
          try {
            this.#outputDecoder.finish();
          } catch (error) {
            this.dispatchEvent(new CustomEvent("client-error", { detail: error }));
          }
        }
      } catch (error) {
        this.dispatchEvent(new CustomEvent("client-error", { detail: error }));
      }
    });
    socket.on("error", (error) => {
      this.dispatchEvent(new CustomEvent<ProviderDiagnostic>("provider-diagnostic", {
        detail: { kind: "socket_error", message: error.message },
      }));
      this.dispatchEvent(new CustomEvent("client-error", { detail: error }));
    });
    socket.on("close", (code, reason) => {
      this.dispatchEvent(new CustomEvent<ProviderDiagnostic>("provider-diagnostic", {
        detail: {
          kind: "socket_closed",
          close_code: code,
          close_reason: reason.toString("utf8").slice(0, 200) || undefined,
        },
      }));
    });
  }

  #waitForOpen(socket: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutMs = this.#options.timeoutMs ?? 30_000;
      const timer = setTimeout(() => reject(new Error("Provider WebSocket open timed out")), timeoutMs);
      socket.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("unexpected-response", (_request, response) => {
        clearTimeout(timer);
        const rawLogId = response.headers["x-tt-logid"];
        const logId = Array.isArray(rawLogId) ? rawLogId[0] : rawLogId;
        this.dispatchEvent(new CustomEvent<ProviderDiagnostic>("provider-diagnostic", {
          detail: { kind: "handshake_rejected", status_code: response.statusCode, log_id: logId },
        }));
        const details = [`HTTP ${response.statusCode}`, logId ? `logid=${logId}` : "logid=unavailable"];
        reject(new Error(`Provider handshake rejected: ${details.join(" ")}`));
        response.resume();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        this.dispatchEvent(new CustomEvent<ProviderDiagnostic>("provider-diagnostic", {
          detail: { kind: "socket_error", message: error.message },
        }));
        reject(error);
      });
    });
  }
}
