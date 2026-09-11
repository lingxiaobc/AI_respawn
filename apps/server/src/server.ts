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
import { AvatarService, isLocalRequest } from "./avatar-service.ts";
import { AuthService, requireMutation, json } from "./auth-service.ts";
import { AuthError, type Identity } from "./auth-store.ts";
import { backupBeforeAccounts } from "./account-migration.ts";
import { ZenMuxPortraitStandardizer } from "./portrait-standardizer.ts";
import { roleInstructions } from "./role-instructions.ts";
import { CallClock } from "../../../packages/protocol/src/call-clock.ts";

const MAX_BUFFERED_BYTES = 1_048_576;
const INPUT_FRAME_BYTES = 640;
const LISTENING_TIMEOUT_MS = 35_000;
const THINKING_TIMEOUT_MS = 20_000;
const SPEAKING_TIMEOUT_MS = 120_000;

await loadLocalEnv();
const PORT = Number.parseInt(process.env.PORT ?? "8877", 10);
const apiKey = process.env.DOUBAO_API_KEY?.trim();
if (!apiKey) throw new Error("DOUBAO_API_KEY is required in the untracked .env file");
const diagnostics = new DiagnosticLogger({ directory: process.env.DIAGNOSTICS_DIR ?? resolve("logs"), retentionDays: 30 });

function isAllowedOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  return origin === "http://127.0.0.1:5173" || origin === "http://localhost:5173";
}

class BrowserSession {
  readonly #identity: Identity;
  #unregister?: () => void;
  #closingTask?: Promise<void>;
  #abort = new AbortController();
  #clock = new CallClock();
  #activated = false;
  #tick?: NodeJS.Timeout;
  #prepareTimer?: NodeJS.Timeout;
  #lastPong = performance.now();
  #totalInput = 0;
  #totalOutput = 0;
  #endReason = "USER_HANGUP";
  #avatarId?: string;
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
  #stateEnteredAt = performance.now();
  #phaseTimer?: NodeJS.Timeout;
  #lastMilestone?: string;
  #lastAudioAt = 0;
  #providerEventCount = 0;
  #providerErrorType?: string;
  #providerErrorCode?: string;
  #providerErrorParam?: string;
  #providerMessage?: string;

  constructor(browser: WebSocket, avatarId: string, identity: Identity) {
    this.#identity = identity;
    this.#avatarId = avatarId;
    this.#browser = browser;
    const callIdentity = createIdentity();
    this.#sessionId = callIdentity.sessionId;
    this.#diagnosticId = callIdentity.diagnosticId;
    this.#provider = new DoubaoRealtimeClient({
      apiKey: apiKey!,
      url: process.env.DOUBAO_WS_URL,
      session: {
        model: process.env.DOUBAO_MODEL,
        voice: process.env.DOUBAO_VOICE,
        instructions: roleInstructions(auth.store.role(identity, avatars.store.active(avatarId)),
          process.env.DOUBAO_INSTRUCTIONS ?? "你是一位温和、简洁的中文语音助手。每次回答不超过两句话。"),
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
    browser.on("pong", () => { this.#lastPong = performance.now(); });
    this.#unregister = auth.register({ identity, avatarId, close: () => this.revoke() });
  }

  revoke(): Promise<void> {
    if (!this.#closed) this.#sendJson({type:"error",state:"error",code:"AUTH_REVOKED",message:"登录或人物授权已失效，本次通话已结束。"});
    return this.close("AUTH_REVOKED");
  }
  #authorized() {
    if (this.#closed) return false;
    if (auth.canCall(this.#identity, this.#avatarId!)) return true;
    void this.revoke(); return false;
  }

  async start(): Promise<void> {
    if (!this.#authorized()) return;
    this.#sendJson({ type: "state", state: "connecting" });
    try {
      this.#prepareTimer = setTimeout(() => this.#fail("PREPARATION_TIMEOUT", "通话准备超时，请重新呼叫"),60_000);
      await avatars.acquireCall(this.#avatarId,this.#sessionId,this.#abort.signal);
      if(!this.#authorized())return;
      avatars.store.db.prepare("UPDATE calls SET user_id=?,auth_session_id=?,purpose=?,profile_revision=? WHERE id=?")
        .run(this.#identity.user.id,this.#identity.sessionId,this.#identity.user.user_type==="ADMIN"?"ADMIN_PREVIEW":"USER_CALL",
          String(auth.store.assignment(this.#identity.user.id,this.#avatarId!)?.revision??0),this.#sessionId);
      this.#sendJson({type:"prepared"});
      await this.#provider.connect();
      if(!this.#authorized())return;
      this.#transition("ready");
      this.#lastPong=performance.now();
      this.#tick = setInterval(() => {
        if(this.#closed)return;
        const now=performance.now();
        if(now-this.#lastPong>15_000){this.#endReason="NETWORK_TIMEOUT";this.#browser.terminate();void this.close();return;}
        if(this.#browser.readyState===WebSocket.OPEN)this.#browser.ping();
        const clock=this.#clock.snapshot(now);
        if(clock) {
          this.#sendJson({type:"clock",...clock});
          if(clock.ended){this.#endReason=clock.ended;this.#fail(clock.ended,clock.ended==="MAX_DURATION"?"本次通话已到 15 分钟":"长时间未讲话，通话已结束");}
        }
      },1000);
    } catch (error) {
      this.#fail("UPSTREAM_CONNECT", error instanceof Error ? error.message : "Provider connection failed");
    }
  }

  close(reason?: string): Promise<void> {
    if (this.#closingTask) return this.#closingTask;
    if(reason)this.#endReason=reason;
    this.#closed = true;
    this.#abort.abort();
    clearInterval(this.#tick);clearTimeout(this.#prepareTimer);
    this.#closingTask=this.#finishClose();
    return this.#closingTask;
  }
  async #finishClose(): Promise<void> {
    if (!["closing", "closed"].includes(this.#state)) this.#transition("closing");
    await this.#provider.close().catch(() => undefined);
    avatars.releaseCall(this.#sessionId,this.#endReason,this.#totalInput,this.#totalOutput);
    this.#unregister?.(); this.#unregister = undefined;
    if (this.#phaseTimer) clearTimeout(this.#phaseTimer);
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
      provider_event_count: this.#providerEventCount,
      audio_idle_ms: this.#lastAudioAt ? Math.round(performance.now() - this.#lastAudioAt) : undefined,
      last_milestone: this.#lastMilestone,
      elapsed_ms: this.#roundStartedAt ? Math.round(performance.now() - this.#roundStartedAt) : undefined,
      phase_duration_ms: Math.round(performance.now() - this.#stateEnteredAt),
      provider_error_type: this.#providerErrorType,
      provider_error_code: this.#providerErrorCode,
      provider_error_param: this.#providerErrorParam,
      provider_message: this.#providerMessage,
    });
    if (this.#browser.readyState === WebSocket.OPEN) this.#browser.close(1000, "session closed");
  }

  #onBrowserMessage(data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean): void {
    if (!this.#authorized()) return;
    try {
      if (isBinary) {
        const pcm = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (this.#state !== "listening") throw new Error("Audio is only accepted while listening");
        if (pcm.byteLength !== INPUT_FRAME_BYTES) throw new Error("Input frame must be exactly 640 bytes");
        this.#inputFrames += 1;
        this.#inputBytes += pcm.byteLength;
        this.#totalInput += pcm.byteLength;
        let energy=0;
        for(let offset=0;offset<pcm.length;offset+=2)energy+=(pcm.readInt16LE(offset)/32768)**2;
        if(Math.sqrt(energy/(pcm.length/2))>=0.02)this.#clock.activity(performance.now());
        this.#lastAudioAt = performance.now();
        if (this.#inputFrames === 1) this.#markMilestone("first_audio_sent");
        this.#provider.appendAudio(pcm);
        return;
      }

      const control = parseBrowserControl(Buffer.from(data as ArrayBuffer).toString("utf8"));
      if (control.type === "session.active") {
        if(this.#state!=="ready")throw new Error("Media readiness requires a ready session");
        if(!this.#activated){this.#activated=true;clearTimeout(this.#prepareTimer);this.#clock.activate(performance.now());avatars.store.connectedCall(this.#sessionId);}
      } else if(control.type === "session.continue") {
        if(this.#state==="ready"||this.#state==="listening")this.#clock.activity(performance.now());
      } else if (control.type === "ptt.start") {
        // Explicit fixed-audio diagnostics use the legacy control flow.
        if(!this.#activated){this.#activated=true;clearTimeout(this.#prepareTimer);this.#clock.activate(performance.now());avatars.store.connectedCall(this.#sessionId);}
        this.#clock.activity(performance.now());
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
        this.#lastMilestone = undefined;
        this.#providerEventCount = 0;
        this.#providerErrorType = undefined;
        this.#providerErrorCode = undefined;
        this.#providerErrorParam = undefined;
        this.#providerMessage = undefined;
        diagnostics.write({
          event: "round_started",
          component: "gateway",
          diagnostic_id: this.#diagnosticId,
          session_id: this.#sessionId,
          round: this.#round,
          timer_name: "listening",
          deadline_ms: LISTENING_TIMEOUT_MS,
        });
        this.#provider.unmute();
        this.#transition("listening");
      } else if (control.type === "ptt.commit") {
        if (this.#state !== "listening") throw new Error(`Cannot commit PTT from ${this.#state}`);
        this.#pttUpAt = performance.now();
        this.#provider.commitTurn();
        this.#markMilestone("commit_sent");
        this.#transition("thinking");
      } else if (control.type === "playback.done") {
        if (this.#state !== "speaking") throw new Error(`Playback cannot finish from ${this.#state}`);
        this.#playbackDone = true;
        this.#maybeReady();
      } else if (control.type === "client.diagnostic") {
        const isLocalMilestone = control.code.startsWith("LOCAL_");
        if (isLocalMilestone) this.#lastMilestone = control.code.toLowerCase();
        diagnostics.write({
          event: isLocalMilestone ? "milestone" : "error",
          component: "browser",
          level: isLocalMilestone ? "info" : "error",
          diagnostic_id: this.#diagnosticId,
          session_id: this.#sessionId,
          round: this.#round || undefined,
          state: this.#state,
          code: control.code,
          message: control.message,
          last_milestone: isLocalMilestone ? control.code.toLowerCase() : this.#lastMilestone,
          elapsed_ms: this.#roundStartedAt ? Math.round(performance.now() - this.#roundStartedAt) : undefined,
        });
      } else {
        void this.close();
      }
    } catch (error) {
      this.#fail("INVALID_BROWSER_EVENT", error instanceof Error ? error.message : "Invalid browser event");
    }
  }

  #onProviderEvent(event: ServerEvent): void {
    avatars.store.recordUsage(this.#sessionId,event);
    if(!this.#authorized())return;
    if (typeof event.event_id === "string") this.#lastProviderEventId = event.event_id;
    this.#providerEventCount += 1;
    const summary = safeEventSummary(event);
    if (event.type !== "response.output_audio.delta") {
      diagnostics.write({
        event: "provider_event",
        component: "provider",
        diagnostic_id: this.#diagnosticId,
        session_id: this.#sessionId,
        round: this.#round || undefined,
        state: this.#state,
        provider_event_id: summary.event_id,
        provider_event_type: summary.type,
        provider_status: summary.status_code,
        provider_error_type: summary.error_type,
        provider_error_code: summary.error_code,
        provider_error_param: summary.error_param,
        provider_message: summary.message,
        event_direction: "inbound",
      });
    }
    if (event.type === "error") {
      this.#providerStatus = summary.status_code;
      this.#providerErrorType = summary.error_type;
      this.#providerErrorCode = summary.error_code;
      this.#providerErrorParam = summary.error_param;
      this.#providerMessage = summary.message;
      this.#fail("UPSTREAM_EVENT", summary.message === "Abnormal silence audio"
        ? "语音服务长时间未收到讲话，本次通话已结束，请重新呼叫"
        : "语音服务暂时不可用，请稍后重新呼叫");
      return;
    }
    if (event.type === "input_audio_buffer.committed") this.#markMilestone("input_committed");
    if (event.type === "conversation.item.input_audio_transcription.completed") this.#markMilestone("asr_completed");
    if (event.type === "response.output_audio.done") this.#markMilestone("audio_done");
    if (event.type === "response.done") this.#markMilestone("response_done");
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
    if (!this.#authorized()) return;
    if (this.#closed || ["error", "closing", "closed"].includes(this.#state)) return;
    if (this.#state === "thinking") this.#transition("speaking");
    const pcm = Buffer.from((raw as CustomEvent<Uint8Array>).detail);
    this.#firstProviderAudioAt ||= performance.now();
    this.#outputChunks += 1;
    this.#outputBytes += pcm.byteLength;
    this.#totalOutput += pcm.byteLength;
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
        provider_event_count: this.#providerEventCount,
        audio_idle_ms: this.#lastAudioAt ? Math.round(finishedAt - this.#lastAudioAt) : undefined,
        last_milestone: this.#lastMilestone,
        phase_duration_ms: Math.round(finishedAt - this.#stateEnteredAt),
        elapsed_ms: this.#roundStartedAt ? Math.round(finishedAt - this.#roundStartedAt) : undefined,
      });
    }
  }

  #transition(next: GatewayState): void {
    if (next !== this.#state && !canTransition(this.#state, next)) {
      throw new Error(`Invalid gateway transition ${this.#state} -> ${next}`);
    }
    const previous = this.#state;
    const now = performance.now();
    const phaseDuration = Math.round(now - this.#stateEnteredAt);
    this.#state = next;
    if(next==="thinking"||next==="speaking")this.#clock.busy();
    if(next==="ready"&&this.#activated)this.#clock.listening(now);
    this.#stateEnteredAt = now;
    if (this.#phaseTimer) clearTimeout(this.#phaseTimer);
    this.#phaseTimer = undefined;
    diagnostics.write({
      event: "state_transition",
      component: "gateway",
      diagnostic_id: this.#diagnosticId,
      session_id: this.#sessionId,
      round: this.#round || undefined,
      state: next,
      state_from: previous,
      state_to: next,
      phase_duration_ms: phaseDuration,
      elapsed_ms: this.#roundStartedAt ? Math.round(now - this.#roundStartedAt) : undefined,
      last_milestone: this.#lastMilestone,
    });
    this.#sendJson({ type: "state", state: next, round: this.#round || undefined });
    const deadline = next === "listening"
      ? LISTENING_TIMEOUT_MS
      : next === "thinking"
        ? THINKING_TIMEOUT_MS
        : next === "speaking" ? SPEAKING_TIMEOUT_MS : undefined;
    if (deadline !== undefined) {
      this.#phaseTimer = setTimeout(() => {
        const message = `${next} phase exceeded ${deadline}ms`;
        this.#fail("UPSTREAM_PHASE_TIMEOUT", message, {
          timer_name: next,
          deadline_ms: deadline,
          phase_duration_ms: Math.round(performance.now() - this.#stateEnteredAt),
        });
      }, deadline);
    }
  }

  #fail(code: string, message: string, extra: Partial<Parameters<typeof diagnostics.write>[0]> = {}): void {
    if(this.#closed)return;
    this.#endReason=code;
    if (this.#state !== "error" && !["closing", "closed"].includes(this.#state)) {
      this.#errorLogged = true;
      if (this.#round > 0) {
        diagnostics.write({
          event: "round_aborted",
          component: "gateway",
          diagnostic_id: this.#diagnosticId,
          session_id: this.#sessionId,
          round: this.#round,
          state: this.#state,
          result: "aborted",
          code,
          message,
          provider_event_id: this.#lastProviderEventId,
          provider_logid: this.#providerLogId,
          provider_status: this.#providerStatus,
          provider_event_count: this.#providerEventCount,
          audio_idle_ms: this.#lastAudioAt ? Math.round(performance.now() - this.#lastAudioAt) : undefined,
          provider_error_type: this.#providerErrorType,
          provider_error_code: this.#providerErrorCode,
          provider_error_param: this.#providerErrorParam,
          provider_message: this.#providerMessage,
          last_milestone: this.#lastMilestone,
          elapsed_ms: this.#roundStartedAt ? Math.round(performance.now() - this.#roundStartedAt) : undefined,
          phase_duration_ms: Math.round(performance.now() - this.#stateEnteredAt),
          ...extra,
        });
      }
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
        provider_event_count: this.#providerEventCount,
        audio_idle_ms: this.#lastAudioAt ? Math.round(performance.now() - this.#lastAudioAt) : undefined,
        provider_error_type: this.#providerErrorType,
        provider_error_code: this.#providerErrorCode,
        provider_error_param: this.#providerErrorParam,
        provider_message: this.#providerMessage,
        last_milestone: this.#lastMilestone,
        elapsed_ms: this.#roundStartedAt ? Math.round(performance.now() - this.#roundStartedAt) : undefined,
        phase_duration_ms: Math.round(performance.now() - this.#stateEnteredAt),
        ...extra,
      });
      this.#transition("error");
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
    if (detail.kind === "event_sent") {
      diagnostics.write({
        event: "provider_event",
        component: "provider",
        diagnostic_id: this.#diagnosticId,
        session_id: this.#sessionId,
        round: this.#round || undefined,
        state: this.#state,
        provider_event_id: detail.event_id,
        provider_event_type: detail.event_type,
        event_direction: "outbound",
        event_size_bytes: detail.event_size_bytes,
      });
      return;
    }
    diagnostics.write({
      event: detail.kind === "socket_error" ? "error" : "provider_event",
      component: "provider",
      level: detail.kind === "socket_error" || detail.kind === "handshake_rejected" ? "error" : "warn",
      diagnostic_id: this.#diagnosticId,
      session_id: this.#sessionId,
      round: this.#round || undefined,
      state: this.#state,
      code: detail.kind.toUpperCase(),
      message: detail.message,
      provider_logid: detail.log_id,
      provider_status: detail.status_code,
      close_code: detail.close_code,
      close_reason: detail.close_reason,
      provider_event_type: detail.kind,
      event_direction: "inbound",
    });
    if(detail.kind === "socket_closed") this.#fail("UPSTREAM_DISCONNECTED", "语音连接已断开，请重新呼叫");
  }

  #markMilestone(name: string): void {
    this.#lastMilestone = name;
    diagnostics.write({
      event: "milestone",
      component: "gateway",
      diagnostic_id: this.#diagnosticId,
      session_id: this.#sessionId,
      round: this.#round || undefined,
      state: this.#state,
      code: name,
      elapsed_ms: this.#roundStartedAt ? Math.round(performance.now() - this.#roundStartedAt) : undefined,
      last_milestone: name,
      input_frames: this.#inputFrames || undefined,
      input_bytes: this.#inputBytes || undefined,
      output_chunks: this.#outputChunks || undefined,
      output_pcm_bytes: this.#outputBytes || undefined,
    });
  }
}

const avatarRoot = resolve(process.env.AVATAR_STORAGE_DIR ?? "artifacts/avatars");
await backupBeforeAccounts(avatarRoot);
const avatars = new AvatarService(avatarRoot,undefined,new ZenMuxPortraitStandardizer());
await avatars.initialized;
const auth = new AuthService(avatars.store);
await auth.store.initialize(process.env.ADMIN_INITIAL_PASSWORD, process.env.AUTH_ALLOW_LOCAL_TEST_PASSWORD === "1" && process.env.NODE_ENV !== "production");
delete process.env.ADMIN_INITIAL_PASSWORD;
const authTimer = setInterval(() => { void auth.sweep().catch(() => undefined); }, 1000);
const authPruneTimer = setInterval(() => auth.store.prune(), 60 * 60_000);
const server = createServer((request, response) => {
  if (request.url?.startsWith("/api/")) {
    try {
      if (!isLocalRequest(request)) throw new AuthError(403,"仅允许本机页面访问");
      if (request.url.startsWith("/api/auth/") || request.url.startsWith("/api/admin/") || request.url === "/api/me") {
        void auth.handle(request,response); return;
      }
      const identity = auth.require(request);
      if (!["GET","HEAD"].includes(request.method??"")) requireMutation(request);
      if (request.url.startsWith("/api/avatars")) {
        void avatars.handle(request,response,{
          admin:identity.user.user_type==="ADMIN",
          check:()=>{if(!auth.store.valid(identity))throw new AuthError(401,"登录已失效，请重新登录");},
          role:avatar=>auth.store.role(identity,avatar),
        }); return;
      }
    } catch(error) {json(response,error instanceof AuthError?error.status:500,{message:error instanceof AuthError?error.message:"服务异常"});return;}
  }
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  response.writeHead(404).end();
});
const wss = new WebSocketServer({ noServer: true, maxPayload: INPUT_FRAME_BYTES });
const sessions = new Set<BrowserSession>();
let shuttingDown = false;

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url??"/","http://localhost");
  if (shuttingDown || url.pathname !== "/ws" || !isAllowedOrigin(request)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  const identity = auth.identity(request), avatarId = url.searchParams.get("avatar");
  if (!identity || !avatarId || !auth.canCall(identity,avatarId)) {
    socket.write(`HTTP/1.1 ${identity?403:401} ${identity?"Forbidden":"Unauthorized"}\r\nConnection: close\r\n\r\n`);
    socket.destroy(); return;
  }
  wss.handleUpgrade(request, socket, head, (browser) => wss.emit("connection", browser, request));
});

wss.on("connection", (browser, request) => {
  const avatarId = new URL(request.url??"/","http://localhost").searchParams.get("avatar")??undefined;
  const identity = auth.identity(request);
  if (!identity || !avatarId || !auth.canCall(identity,avatarId)) { browser.close(1008,"Unauthorized"); return; }
  const session = new BrowserSession(browser,avatarId,identity);
  sessions.add(session);
  browser.once("close",()=>{void session.close().finally(()=>sessions.delete(session));});
  void session.start();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(JSON.stringify({ type: "gateway-ready", url: `http://127.0.0.1:${PORT}`, diagnostics_dir: diagnostics.directory }));
});

async function shutdown(): Promise<void> {
  if(shuttingDown)return;
  shuttingDown=true;
  clearInterval(authTimer);clearInterval(authPruneTimer);
  await avatars.stop();
  await Promise.allSettled([...sessions].map(session=>session.close("SERVICE_SHUTDOWN")));
  wss.clients.forEach(client=>client.terminate());
  await new Promise<void>(resolveClose=>server.close(()=>resolveClose()));
  await avatars.dispose();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
process.on("message", message => {
  if(message&&typeof message==="object"&&"type" in message&&message.type==="shutdown")void shutdown();
});
