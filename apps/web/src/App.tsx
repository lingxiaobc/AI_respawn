import { useCallback, useEffect, useRef, useState } from "react";
import { nextPlaybackStart } from "../../../packages/audio/src/resample.ts";
import {
  DEFAULT_TURN_DETECTOR_CONFIG,
  TurnDetector,
  type TurnDetectorState,
} from "../../../packages/audio/src/turn-detector.ts";
import type { GatewayMessage, GatewayState } from "../../../packages/protocol/src/browser.ts";

type UiState = GatewayState | "initializing";

const stateCopy: Record<UiState, string> = {
  initializing: "正在申请麦克风权限",
  connecting: "正在建立安全会话",
  ready: "正在准备下一轮监听",
  listening: "正在聆听",
  thinking: "正在理解你的话",
  speaking: "正在回应",
  closing: "正在关闭会话",
  closed: "会话已关闭",
  error: "连接出现问题",
};

const turnCopy: Record<TurnDetectorState, string> = {
  waiting: "请直接说话",
  speaking: "听见了，继续说",
  silence: "检测到停顿，1.2 秒后回复",
};

const stages: Array<{ label: string; states: UiState[] }> = [
  { label: "连接", states: ["connecting", "initializing", "ready"] },
  { label: "聆听", states: ["listening"] },
  { label: "思考", states: ["thinking"] },
  { label: "回应", states: ["speaking"] },
];

const detectorConfig = DEFAULT_TURN_DETECTOR_CONFIG;
const PRE_ROLL_FRAME_COUNT = 25;

export function App() {
  const [state, setState] = useState<UiState>("connecting");
  const [turnPhase, setTurnPhase] = useState<TurnDetectorState>("waiting");
  const [round, setRound] = useState(0);
  const [diagnosticId, setDiagnosticId] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [inputFrames, setInputFrames] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<UiState>(state);
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const captureRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef(new TurnDetector(detectorConfig));
  const autoStartRef = useRef(false);
  const turnEndedAtRef = useRef(0);
  const nextPlaybackAtRef = useRef(0);
  const playbackTimerRef = useRef<number | null>(null);
  const firstAudioSeenRef = useRef(false);
  const preRollRef = useRef<ArrayBuffer[]>([]);

  const updateState = useCallback((next: UiState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const sendControl = useCallback((type: string) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) throw new Error("本地网关尚未连接");
    socket.send(JSON.stringify({ type }));
  }, []);

  const reportDiagnostic = useCallback((code: string, message?: string) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify({ type: "client.diagnostic", code, message: message?.slice(0, 160) }));
    } catch {
      // The gateway close path remains the diagnostic fallback.
    }
  }, []);

  const enqueuePlayback = useCallback((arrayBuffer: ArrayBuffer) => {
    const context = audioContextRef.current;
    if (!context) return;
    const pcm = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(pcm.length);
    for (let index = 0; index < pcm.length; index += 1) float32[index] = pcm[index]! / 32768;
    const audio = context.createBuffer(1, float32.length, 24_000);
    audio.copyToChannel(float32, 0);
    const source = context.createBufferSource();
    source.buffer = audio;
    source.connect(context.destination);
    const startsAt = nextPlaybackStart(context.currentTime, nextPlaybackAtRef.current);
    source.start(startsAt);
    nextPlaybackAtRef.current = startsAt + audio.duration;
    if (!firstAudioSeenRef.current) {
      firstAudioSeenRef.current = true;
      const scheduleDelay = Math.max(0, startsAt - context.currentTime) * 1000;
      const endedAt = turnEndedAtRef.current || performance.now();
      setLatencyMs(Math.round(performance.now() - endedAt + scheduleDelay));
    }
    updateState("speaking");
  }, [updateState]);

  const finishPlayback = useCallback(() => {
    const context = audioContextRef.current;
    if (!context) return;
    const waitMs = Math.max(0, (nextPlaybackAtRef.current - context.currentTime) * 1000);
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    playbackTimerRef.current = window.setTimeout(() => {
      try { sendControl("playback.done"); } catch { /* close handler owns the error state */ }
      playbackTimerRef.current = null;
    }, waitMs + 20);
  }, [sendControl]);

  const commitDetectedTurn = useCallback(() => {
    if (stateRef.current !== "listening") return;
    captureRef.current?.port.postMessage({ active: false });
    detectorRef.current.reset();
    setTurnPhase("waiting");
    turnEndedAtRef.current = performance.now();
    reportDiagnostic("LOCAL_TURN_END", "silence_timeout_or_max_duration");
    updateState("thinking");
    try {
      sendControl("ptt.commit");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "提交失败";
      reportDiagnostic("BROWSER_COMMIT", message);
      setError(message);
      updateState("error");
    }
  }, [reportDiagnostic, sendControl, updateState]);

  const beginDetectedTurn = useCallback((socket: WebSocket) => {
    if (stateRef.current !== "ready") return;
    try {
      const preRoll = preRollRef.current.splice(0);
      sendControl("ptt.start");
      updateState("listening");
      reportDiagnostic("LOCAL_SPEECH_START", `pre_roll_frames=${preRoll.length}`);
      for (const frame of preRoll) {
        if (socket.readyState !== WebSocket.OPEN) throw new Error("本地网关在语音开始时断开");
        socket.send(frame);
        setInputFrames((value) => value + 1);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "无法开始语音轮次";
      reportDiagnostic("BROWSER_TURN_START", message);
      setError(message);
      updateState("error");
    }
  }, [reportDiagnostic, sendControl, updateState]);

  const ensureAudio = useCallback(async () => {
    if (captureRef.current && audioContextRef.current) {
      await audioContextRef.current.resume();
      return;
    }
    updateState("initializing");
    const context = new AudioContext({ latencyHint: "interactive" });
    await context.audioWorklet.addModule("/capture-worklet.js");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const source = context.createMediaStreamSource(stream);
    const capture = new AudioWorkletNode(context, "ptt-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
    });
    capture.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const currentState = stateRef.current;
      if (!(currentState === "ready" || currentState === "listening") || event.data.byteLength !== 640) return;
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return;
      const bytes = new Uint8Array(event.data).slice();
      const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      const events = detectorRef.current.push(pcm);
      if (currentState === "ready") {
        preRollRef.current.push(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
        if (preRollRef.current.length > PRE_ROLL_FRAME_COUNT) preRollRef.current.shift();
        if (events.includes("speech-start")) beginDetectedTurn(socket);
        return;
      }
      socket.send(bytes);
      setInputFrames((value) => value + 1);
      if (events.includes("speech-start")) {
        setTurnPhase("speaking");
        reportDiagnostic("LOCAL_SPEECH_START", "pre_roll_frames=0");
      } else if (detectorRef.current.state === "silence") setTurnPhase("silence");
      if (events.includes("turn-end")) commitDetectedTurn();
    };
    source.connect(capture);
    audioContextRef.current = context;
    captureRef.current = capture;
    streamRef.current = stream;
    await context.resume();
  }, [commitDetectedTurn, updateState]);

  const startListening = useCallback(async () => {
    if (stateRef.current !== "ready") return;
    setError(null);
    setInputFrames(0);
    setLatencyMs(null);
    setTurnPhase("waiting");
    firstAudioSeenRef.current = false;
    nextPlaybackAtRef.current = 0;
    detectorRef.current.reset();
    preRollRef.current = [];
    try {
      await ensureAudio();
      const afterAudioState = stateRef.current as UiState;
      if (afterAudioState !== "ready" && afterAudioState !== "initializing") return;
      if (afterAudioState === "initializing") updateState("ready");
      captureRef.current?.port.postMessage({ active: true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "无法启用麦克风";
      reportDiagnostic("MICROPHONE_INIT", message);
      setError(message);
      updateState("error");
    }
  }, [ensureAudio, reportDiagnostic, updateState]);

  useEffect(() => {
    let disposed = false;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        enqueuePlayback(event.data);
        return;
      }
      const message = JSON.parse(String(event.data)) as GatewayMessage;
      if (message.diagnostic_id) setDiagnosticId(message.diagnostic_id);
      if (message.round) setRound(message.round);
      if (message.type === "error") {
        setError(message.message ?? "本地网关返回错误");
        updateState("error");
      } else if (message.type === "state" && message.state && message.state !== "closed") {
        updateState(message.state);
      } else if (message.type === "turn" && message.event === "audio.done") {
        finishPlayback();
      }
    };
    socket.onerror = () => {
      if (!disposed) {
        reportDiagnostic("BROWSER_SOCKET_ERROR", "WebSocket error");
        setError("无法连接本地语音网关，请确认服务已启动");
        updateState("error");
      }
    };
    socket.onclose = () => {
      if (!disposed && stateRef.current !== "error") updateState("closed");
    };
    return () => {
      disposed = true;
      socket.close(1000, "page unmounted");
      if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
      captureRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
    };
  }, [enqueuePlayback, finishPlayback, reportDiagnostic, updateState]);

  useEffect(() => {
    if (state !== "ready" || autoStartRef.current) return;
    autoStartRef.current = true;
    void startListening().finally(() => { autoStartRef.current = false; });
  }, [startListening, state]);

  const statusText = error ?? (state === "listening" ? turnCopy[turnPhase] : stateCopy[state]);

  return (
    <main className={`shell is-${state} phase-${turnPhase}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark" />声息</div>
        <div className="privacy"><span />仅本机 · 密钥隔离</div>
      </header>
      <section className="stage" aria-labelledby="page-title">
        <p className="eyebrow">AI REALTIME VOICE / AUTO ENDPOINTING</p>
        <h1 id="page-title">说一句，听见回应。</h1>
        <p className="lede">自动监听你的声音。检测到停顿后，约 1.2 秒内提交本轮，让每个状态都清楚可见。</p>
        <div className="voice-control" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="listen-core">
            <span className="mic-glyph" />
            <strong>{state === "listening" ? "自动聆听" : stateCopy[state]}</strong>
            <small>{state === "listening" ? "SILENCE TO SEND" : "AUTO TURN DETECTION"}</small>
          </div>
        </div>
        <div className="status-line" role="status" aria-live="polite"><span className="status-dot" />{statusText}</div>
        {diagnosticId && <div className="diagnostic-id">诊断 ID：{diagnosticId}</div>}
        {state === "error" && <button className="retry" type="button" onClick={() => location.reload()}>重新连接</button>}
      </section>
      <section className="telemetry" aria-label="会话状态">
        <div className="state-track">
          {stages.map((stage, index) => (
            <div className={stage.states.includes(state) ? "state active" : "state"} key={stage.label}>
              <span>{String(index + 1).padStart(2, "0")}</span>{stage.label}
            </div>
          ))}
        </div>
        <dl className="metrics">
          <div><dt>会话轮次</dt><dd>{round || "尚未开始"}</dd></div>
          <div><dt>判停到首声</dt><dd>{latencyMs === null ? "—" : `${latencyMs} ms`}</dd></div>
          <div><dt>输入帧</dt><dd>{inputFrames || "16 kHz PCM"}</dd></div>
        </dl>
      </section>
      <footer>检测到说话后，连续静音 1.2 秒自动回复 · 播放期间会暂时锁定录音</footer>
    </main>
  );
}
