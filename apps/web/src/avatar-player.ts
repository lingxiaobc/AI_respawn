import { AvatarAudioChunks, pcm16Wav } from "../../../packages/avatar/src/audio.ts";

export type AvatarEvent = "ready" | "started" | "done" | "error";
/** Owns the iframe protocol, resampling lifetime, and stale-round rejection. */
export class AvatarPlayer {
  #chunks = new AvatarAudioChunks();
  #round = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #inputEnded = false;
  #completed = false;
  ready = false;
  readonly frame: HTMLIFrameElement;
  readonly onEvent: (event: AvatarEvent, message?: string) => void;
  constructor(
    frame: HTMLIFrameElement,
    onEvent: (event: AvatarEvent, message?: string) => void,
  ) {
    this.frame = frame; this.onEvent = onEvent;
    window.addEventListener("message", this.#receive);
  }
  #receive = (event: MessageEvent) => {
    if (event.origin !== location.origin || event.source !== this.frame.contentWindow || event.data?.source !== "dh-live") return;
    const data = event.data;
    if (data.type === "ready") { this.ready = true; this.onEvent("ready"); return; }
    if (data.type === "error") {
      const ended = this.#inputEnded;
      this.ready = false; this.stop(); this.onEvent("error", data.message);
      if (ended) this.onEvent("done");
      return;
    }
    if (data.round !== this.#round) return;
    if (data.type === "started") this.onEvent("started");
    if (data.type === "done" && this.#inputEnded && !this.#completed) {
      this.#completed = true; clearTimeout(this.#timer); this.onEvent("done");
    }
  };
  #send(type: string, extra: Record<string, unknown> = {}, transfer: Transferable[] = []) {
    this.frame.contentWindow?.postMessage({ source: "respawn", type, round: this.#round, ...extra }, location.origin, transfer);
  }
  #audio(chunks: Int16Array[]) {
    for (const chunk of chunks) {
      const wav = pcm16Wav(chunk);
      this.#send("audio", { wav }, [wav]);
    }
  }
  begin(): void {
    if (!this.ready) throw new Error("数字人尚未准备好");
    clearTimeout(this.#timer);
    this.#round++; this.#inputEnded = false; this.#completed = false; this.#chunks.reset(); this.#send("begin");
  }
  push(bytes: ArrayBuffer): void { if (this.ready) this.#audio(this.#chunks.push(bytes)); }
  finish(): void {
    this.#inputEnded = true;
    if (!this.ready) { this.onEvent("done"); return; }
    this.#audio(this.#chunks.finish()); this.#send("end");
    this.#timer = setTimeout(() => {
      this.stop(); this.ready = false;
      this.onEvent("error", "数字人播放结束等待超时，本轮已停止");
      this.onEvent("done");
    }, 45_000);
  }
  stop(): void {
    clearTimeout(this.#timer); this.#inputEnded = false; this.#chunks.reset(); this.#round++; this.#send("stop");
  }
  dispose(): void { this.stop(); window.removeEventListener("message", this.#receive); }
}
