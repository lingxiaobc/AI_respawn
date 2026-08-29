import WebSocket from "ws";
import {
  createAudioAppendEvent,
  createCloseEvent,
  createCommitEvent,
  createMuteEvent,
  createSessionEvent,
  createUnmuteEvent,
  DEFAULT_DOUBAO_URL,
  parseServerEvent,
  type ServerEvent,
  type SessionConfig,
} from "./protocol.ts";

export interface DoubaoClientOptions {
  apiKey: string;
  url?: string;
  session: SessionConfig;
  timeoutMs?: number;
}

export class DoubaoRealtimeClient extends EventTarget {
  readonly #options: DoubaoClientOptions;
  #socket?: WebSocket;
  #sessionCreated = false;
  #closed = false;

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
    this.#send(createAudioAppendEvent(pcm));
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
      await this.waitFor("session.closed").catch(() => undefined);
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
          reject(new Error(`Provider error while waiting for ${type}`));
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

  #send(value: unknown): void {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
      throw new Error("Provider WebSocket is not open");
    }
    this.#socket.send(JSON.stringify(value));
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
      } catch (error) {
        this.dispatchEvent(new CustomEvent("client-error", { detail: error }));
      }
    });
    socket.on("error", (error) => {
      this.dispatchEvent(new CustomEvent("client-error", { detail: error }));
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
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          if (Buffer.concat(chunks).byteLength < 2_048) chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          const logId = response.headers["x-tt-logid"];
          const body = Buffer.concat(chunks).toString("utf8").trim().slice(0, 2_048);
          const details = [
            `HTTP ${response.statusCode}`,
            logId ? `logid=${Array.isArray(logId) ? logId[0] : logId}` : undefined,
            body ? `body=${body}` : undefined,
          ].filter(Boolean);
          reject(new Error(`Provider handshake rejected: ${details.join(" ")}`));
        });
        response.resume();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
}
