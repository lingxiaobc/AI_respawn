import { useCallback, useEffect, useRef, useState } from "react";
import { nextPlaybackStart } from "../../../packages/audio/src/resample.ts";
import type { GatewayMessage, GatewayState } from "../../../packages/protocol/src/browser.ts";

type UiState = GatewayState | "initializing";

const stateCopy: Record<UiState, string> = {
  initializing: "正在申请麦克风权限",
  connecting: "正在建立安全会话",
  ready: "已就绪，按住说话",
  listening: "正在聆听，松开即发送",
  thinking: "正在理解你的话",
  speaking: "正在回应",
  closing: "正在关闭会话",
  closed: "会话已关闭",
  error: "连接出现问题",
};

const stages: Array<{ label: string; states: UiState[] }> = [
  { label: "连接", states: ["connecting", "initializing", "ready"] },
  { label: "聆听", states: ["listening"] },
  { label: "思考", states: ["thinking"] },
  { label: "回应", states: ["speaking"] },
];

export function App() {
  const [state, setState] = useState<UiState>("connecting");
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
  const pressedRef = useRef(false);
  const pttUpAtRef = useRef(0);
  const nextPlaybackAtRef = useRef(0);
  const playbackTimerRef = useRef<number | null>(null);
  const firstAudioSeenRef = useRef(false);

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
      setLatencyMs(Math.round(performance.now() - pttUpAtRef.current + scheduleDelay));
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
    };
  }, [enqueuePlayback, finishPlayback, reportDiagnostic, updateState]);

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
      if (stateRef.current !== "listening") return;
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN || event.data.byteLength !== 640) return;
      socket.send(event.data);
      setInputFrames((value) => value + 1);
    };
    source.connect(capture);
    audioContextRef.current = context;
    captureRef.current = capture;
    streamRef.current = stream;
  }, [updateState]);

  const beginTalk = useCallback(async () => {
    if (stateRef.current !== "ready" || pressedRef.current) return;
    pressedRef.current = true;
    setError(null);
    setInputFrames(0);
    setLatencyMs(null);
    firstAudioSeenRef.current = false;
    nextPlaybackAtRef.current = 0;
    try {
      await ensureAudio();
      if (!pressedRef.current) {
        updateState("ready");
        return;
      }
      sendControl("ptt.start");
      updateState("listening");
      captureRef.current!.port.postMessage({ active: true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "无法启用麦克风";
      reportDiagnostic("MICROPHONE_INIT", message);
      setError(message);
      updateState("error");
      pressedRef.current = false;
    }
  }, [ensureAudio, reportDiagnostic, sendControl, updateState]);

  const endTalk = useCallback(() => {
    pressedRef.current = false;
    if (stateRef.current !== "listening") return;
    captureRef.current?.port.postMessage({ active: false });
    pttUpAtRef.current = performance.now();
    updateState("thinking");
    try { sendControl("ptt.commit"); } catch (cause) {
      const message = cause instanceof Error ? cause.message : "提交失败";
      reportDiagnostic("BROWSER_COMMIT", message);
      setError(message);
      updateState("error");
    }
  }, [reportDiagnostic, sendControl, updateState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      event.preventDefault();
      void beginTalk();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      endTalk();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      captureRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
    };
  }, [beginTalk, endTalk]);

  const buttonDisabled = state !== "ready" && state !== "listening";
  const buttonLabel = state === "listening" ? "松开发送" : state === "speaking" ? "正在回应" : "按住说话";

  return (
    <main className={`shell is-${state}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark" />声息</div>
        <div className="privacy"><span />仅本机 · 密钥隔离</div>
      </header>
      <section className="stage" aria-labelledby="page-title">
        <p className="eyebrow">AI REALTIME VOICE / PUSH TO TALK</p>
        <h1 id="page-title">说一句，听见回应。</h1>
        <p className="lede">按住说话，松开即发送。一次只处理一轮对话，让每个状态都清楚可见。</p>
        <div className="voice-control">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <button
            className="talk-button"
            type="button"
            aria-label={buttonLabel}
            disabled={buttonDisabled}
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); void beginTalk(); }}
            onPointerUp={endTalk}
            onPointerCancel={endTalk}
          >
            <span className="mic-glyph" aria-hidden="true" />
            <strong>{buttonLabel}</strong>
            <small>{state === "listening" ? "RELEASE TO SEND" : "HOLD TO TALK"}</small>
          </button>
        </div>
        <div className="status-line" role="status"><span className="status-dot" />{error ?? stateCopy[state]}</div>
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
          <div><dt>松开到首声</dt><dd>{latencyMs === null ? "—" : `${latencyMs} ms`}</dd></div>
          <div><dt>输入帧</dt><dd>{inputFrames || "16 kHz PCM"}</dd></div>
        </dl>
      </section>
      <footer>空格键同样可按住说话 · 播放期间会暂时锁定录音</footer>
    </main>
  );
}
