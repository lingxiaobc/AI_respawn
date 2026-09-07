import { useCallback, useEffect, useRef, useState } from "react";
import { nextPlaybackStart } from "../../../packages/audio/src/resample.ts";
import {
  DEFAULT_TURN_DETECTOR_CONFIG,
  TurnDetector,
  type TurnDetectorState,
} from "../../../packages/audio/src/turn-detector.ts";
import type { GatewayMessage, GatewayState } from "../../../packages/protocol/src/browser.ts";
import { AvatarPlayer } from "./avatar-player.ts";

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
  const [state, setState] = useState<UiState>("ready");
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
  const avatarFrameRef = useRef<HTMLIFrameElement | null>(null);
  const avatarRef = useRef<AvatarPlayer | null>(null);
  const avatarRoundRef = useRef(false);
  const roundAudioStartedRef = useRef(false);
  const sampleRef = useRef(false);
  const [avatarStatus, setAvatarStatus] = useState("正在加载人物");
  const [avatarReady, setAvatarReady] = useState(false);
  const [avatarEnabled, setAvatarEnabled] = useState(true);
  const avatarEnabledRef = useRef(true);
  const [callStarted, setCallStarted] = useState(false);
  const [samplePlaying, setSamplePlaying] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const sampleTimersRef = useRef<number[]>([]);

  useEffect(() => {
    const frame = avatarFrameRef.current;
    if (!frame) return;
    const player = new AvatarPlayer(frame, (event, message) => {
      if (event === "ready") { setAvatarReady(true); setAvatarStatus("人物已就绪"); }
      if (event === "started") {
        setAvatarStatus("正在播报");
        if (!sampleRef.current) setLatencyMs(Math.round(performance.now() - turnEndedAtRef.current));
      }
      if (event === "done") {
        setAvatarStatus(player.ready ? "人物已就绪" : "已切换纯语音");
        if (sampleRef.current) {
          sampleRef.current = false; setSamplePlaying(false); setSampleCount(n => n + 1);
        } else {
          const socket = socketRef.current;
          if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "playback.done" }));
        }
      }
      if (event === "error") {
        setAvatarReady(false); setAvatarStatus(message ?? "人物不可用");
        avatarEnabledRef.current = false; setAvatarEnabled(false);
        if (sampleRef.current) {
          sampleRef.current = false; setSamplePlaying(false);
          sampleTimersRef.current.forEach(window.clearTimeout);
        }
      }
    });
    avatarRef.current = player;
    return () => { sampleTimersRef.current.forEach(window.clearTimeout); player.dispose(); avatarRef.current = null; };
  }, []);

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
    if (!roundAudioStartedRef.current) {
      roundAudioStartedRef.current = true;
      avatarRoundRef.current = avatarEnabledRef.current && !!avatarRef.current?.ready;
      if (avatarRoundRef.current) avatarRef.current!.begin();
    }
    if (avatarRoundRef.current) {
      avatarRef.current?.push(arrayBuffer);
      updateState("speaking");
      return;
    }
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
    if (avatarRoundRef.current) { avatarRef.current?.finish(); return; }
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
    roundAudioStartedRef.current = false;
    avatarRoundRef.current = false;
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
    if (!callStarted) return;
    let disposed = false;
    updateState("connecting");
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
        avatarRef.current?.stop();
        captureRef.current?.port.postMessage({ active: false });
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
      if (!sampleRef.current) avatarRef.current?.stop();
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
  }, [callStarted, enqueuePlayback, finishPlayback, reportDiagnostic, updateState]);

  useEffect(() => {
    if (!callStarted || state !== "ready" || autoStartRef.current) return;
    autoStartRef.current = true;
    void startListening().finally(() => { autoStartRef.current = false; });
  }, [callStarted, startListening, state]);

  const playSample = async () => {
    const player = avatarRef.current;
    if (!player?.ready || sampleRef.current || callStarted) return;
    sampleRef.current = true; setSamplePlaying(true); setAvatarStatus("准备示例音频");
    let decoder: AudioContext | undefined;
    try {
      // Decode only the bundled public sample. No microphone or API is used.
      decoder = new AudioContext({ sampleRate: 24_000 });
      const response = await fetch("/dh-live/common/test.wav");
      if (!response.ok) throw new Error("示例音频加载失败");
      const audio = await decoder.decodeAudioData(await response.arrayBuffer());
      const floats = audio.getChannelData(0);
      const pcm = Int16Array.from(floats, sample => Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)));
      player.begin();
      sampleTimersRef.current = [];
      // Replay in 80 ms network-sized pieces, without waiting for the full response.
      for (let offset = 0; offset < pcm.length; offset += 1920) {
        const segment = pcm.slice(offset, offset + 1920).buffer;
        sampleTimersRef.current.push(window.setTimeout(() => player.push(segment), offset / 24));
      }
      sampleTimersRef.current.push(window.setTimeout(() => player.finish(), pcm.length / 24 + 1));
    } catch (cause) {
      sampleRef.current = false; setSamplePlaying(false);
      setAvatarStatus(cause instanceof Error ? cause.message : "示例播放失败");
    } finally { await decoder?.close(); }
  };

  const endCall = () => {
    setCallStarted(false); avatarRef.current?.stop();
    sampleTimersRef.current.forEach(window.clearTimeout);
    captureRef.current?.port.postMessage({ active: false });
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    if (socketRef.current?.readyState === WebSocket.OPEN) sendControl("session.close");
    updateState("closed");
  };

  const statusText = error ?? (state === "listening" ? turnCopy[turnPhase] : stateCopy[state]);

  return (
    <main className={`shell is-${state} phase-${turnPhase}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark" />声息</div>
        <div className="privacy"><span />人物本机驱动 · 密钥隔离</div>
      </header>
      <section className="stage" aria-labelledby="page-title">
        <p className="eyebrow">DOUBAO VOICE / DH_LIVE_MINI</p>
        <h1 id="page-title">让回应，有了面容。</h1>
        <p className="lede">先播放示例观察嘴型，再开始豆包语音通话。人物在本机浏览器中驱动。</p>
        <div className="avatar-stage">
          <iframe ref={avatarFrameRef} title="固定示例数字人" src="/dh-live/frame.html" allow="autoplay" />
          {!avatarEnabled && <div className="avatar-fallback">纯语音模式</div>}
        </div>
        <p className="avatar-status" role="status">{avatarStatus} · 示例完成 {sampleCount} 次</p>
        <div className="avatar-actions">
          <button type="button" onClick={() => void playSample()} disabled={!avatarReady || !avatarEnabled || samplePlaying || callStarted}>播放示例音频</button>
          <button type="button" onClick={() => setCallStarted(true)} disabled={samplePlaying || callStarted || state !== "ready" || (avatarEnabled && !avatarReady)}>开始语音通话</button>
          {callStarted && <button type="button" onClick={endCall}>结束通话</button>}
          <label><input type="checkbox" checked={avatarEnabled} disabled={callStarted || samplePlaying || !avatarReady}
            onChange={event => { avatarEnabledRef.current = event.target.checked; setAvatarEnabled(event.target.checked); }} />显示数字人</label>
        </div>
        <p className="avatar-note">固定上游示例人物，保留 MatesX 标识。头部、颈部和身体固定，仅保留眨眼与面部内部的嘴型变化。</p>
        <div className="status-line" role="status" aria-live="polite"><span className="status-dot" />{!callStarted && state === "ready" ? "可播放示例，或开始语音通话" : statusText}</div>
        {diagnosticId && <div className="diagnostic-id">诊断 ID：{diagnosticId}</div>}
        {(state === "error" || state === "closed") && <button className="retry" type="button" onClick={() => location.reload()}>重新连接</button>}
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
