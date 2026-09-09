import { useCallback, useEffect, useRef, useState } from "react";
import { nextPlaybackStart } from "../../../packages/audio/src/resample.ts";
import {
  DEFAULT_TURN_DETECTOR_CONFIG,
  TurnDetector,
  type TurnDetectorState,
} from "../../../packages/audio/src/turn-detector.ts";
import type { GatewayMessage, GatewayState } from "../../../packages/protocol/src/browser.ts";
import { AvatarPlayer } from "./avatar-player.ts";
import type { PhotoAvatar } from "./PhotoUpload.tsx";

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


const detectorConfig = DEFAULT_TURN_DETECTOR_CONFIG;
const PRE_ROLL_FRAME_COUNT = 25;

export function CallRoom({ avatar, onExit }: { avatar: PhotoAvatar; onExit: () => void }) {
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
  const [avatarStatus, setAvatarStatus] = useState("正在加载人物");
  const [avatarReady, setAvatarReady] = useState(false);
  const [avatarEnabled, setAvatarEnabled] = useState(true);
  const avatarEnabledRef = useRef(true);
  const [callStarted, setCallStarted] = useState(false);
  const [answered, setAnswered] = useState(false);
  const answerLock=useRef(false);
  const [callPrepared, setCallPrepared] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [clock, setClock] = useState({elapsedSeconds:0,idleRemaining:130,maxRemaining:900});
  const activated = useRef(false);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const frameSrc = avatar.frameUrl!;
  const callGeneration = useRef(0);
  const playbackSources = useRef(new Set<AudioBufferSourceNode>());

  useEffect(() => {
    setAvatarReady(false); setAvatarStatus("正在加载人物");
    avatarEnabledRef.current = true; setAvatarEnabled(true);
    const frame = avatarFrameRef.current;
    if (!frame) return;
    const player = new AvatarPlayer(frame, (event, message) => {
      if (event === "ready") { setAvatarReady(true); setAvatarStatus("人物已就绪"); }
      if (event === "started") {
        setAvatarStatus("正在播报");
        setLatencyMs(Math.round(performance.now() - turnEndedAtRef.current));
      }
      if (event === "done") {
        setAvatarStatus(player.ready ? "人物已就绪" : "已切换纯语音");
        const socket = socketRef.current;
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "playback.done" }));
      }
      if (event === "error") {
        setAvatarReady(false); setAvatarStatus(`${message ?? "人物不可用"}，已切换纯语音`);
        avatarEnabledRef.current = false; setAvatarEnabled(false);
      }
    });
    avatarRef.current = player;
    return () => { player.dispose(); avatarRef.current = null; };
  }, [frameSrc, callPrepared]);



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
    playbackSources.current.add(source);
    source.onended = () => { playbackSources.current.delete(source); source.disconnect(); };
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
    const generation = callGeneration.current;
    if (captureRef.current && audioContextRef.current) {
      await audioContextRef.current.resume();
      return;
    }
    updateState("initializing");
    const context = new AudioContext({ latencyHint: "interactive" });
    audioContextRef.current = context;
    await context.audioWorklet.addModule("/capture-worklet.js");
    if (generation !== callGeneration.current) throw new Error("通话已结束");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (generation !== callGeneration.current) {
      stream.getTracks().forEach(track => track.stop());
      if (context.state !== "closed") await context.close();
      throw new Error("通话已结束");
    }
    streamRef.current = stream;
    const source = context.createMediaStreamSource(stream);
    const capture = new AudioWorkletNode(context, "ptt-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
    });
    capture.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const currentState = stateRef.current;
      if (mutedRef.current || !(currentState === "ready" || currentState === "listening") || event.data.byteLength !== 640) return;
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
    if (generation !== callGeneration.current) throw new Error("通话已结束");
    setMicrophoneReady(true);
  }, [beginDetectedTurn, commitDetectedTurn, updateState]);

  const startListening = useCallback(async () => {
    const generation = callGeneration.current;
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
      if (generation !== callGeneration.current) return;
      const afterAudioState = stateRef.current as UiState;
      if (afterAudioState !== "ready" && afterAudioState !== "initializing") return;
      if (afterAudioState === "initializing") updateState("ready");
      captureRef.current?.port.postMessage({ active: !mutedRef.current });
      if (!activated.current) { activated.current = true; sendControl("session.active"); }
    } catch (cause) {
      if (generation !== callGeneration.current) return;
      const message = cause instanceof Error ? cause.message : "无法启用麦克风";
      reportDiagnostic("MICROPHONE_INIT", message);
      setError(message);
      setCallStarted(false);
      updateState("error");
    }
  }, [ensureAudio, reportDiagnostic, updateState]);

  useEffect(() => {
    if (!callStarted) return;
    callGeneration.current++;
    let disposed = false;
    updateState("connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/ws?avatar=${avatar.id}`);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;
    socket.onmessage = (event) => {
      if (disposed || socketRef.current !== socket) return;
      if (event.data instanceof ArrayBuffer) {
        enqueuePlayback(event.data);
        return;
      }
      const message = JSON.parse(String(event.data)) as GatewayMessage;
      if (message.type === "prepared") { setCallPrepared(true); return; }
      if (message.type === "clock") { setClock({elapsedSeconds:message.elapsedSeconds??0,idleRemaining:message.idleRemaining??130,maxRemaining:message.maxRemaining??900}); return; }
      if (message.diagnostic_id) setDiagnosticId(message.diagnostic_id);
      if (message.round) setRound(message.round);
      if (message.type === "error") {
        callGeneration.current++; setCallStarted(false);
        avatarRef.current?.stop();
        captureRef.current?.port.postMessage({ active: false });
        for (const source of playbackSources.current) source.stop();
        playbackSources.current.clear();
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
        callGeneration.current++; setCallStarted(false);
        reportDiagnostic("BROWSER_SOCKET_ERROR", "WebSocket error");
        setError("无法连接本地语音网关，请确认服务已启动");
        updateState("error");
      }
    };
    socket.onclose = () => {
      if (disposed || socketRef.current !== socket) return;
      callGeneration.current++; setCallStarted(false);
      avatarRef.current?.stop();
      captureRef.current?.port.postMessage({ active: false });
      for (const source of playbackSources.current) source.stop();
      playbackSources.current.clear();
      if (!disposed && stateRef.current !== "error") updateState("closed");
    };
    return () => {
      disposed = true;
      callGeneration.current++; autoStartRef.current = false;
      avatarRef.current?.stop();
      socket.close(1000, "page unmounted");
      if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
      captureRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioContextRef.current?.state !== "closed") void audioContextRef.current?.close();
      setMicrophoneReady(false);
      socketRef.current = null; captureRef.current = null; streamRef.current = null; audioContextRef.current = null;
      playbackSources.current.clear();
    };
  }, [callStarted, enqueuePlayback, finishPlayback, reportDiagnostic, updateState]);

  useEffect(() => {
    if (!callStarted || !callPrepared || (!avatarReady && avatarEnabled) || state !== "ready" || autoStartRef.current) return;
    autoStartRef.current = true;
    const generation = callGeneration.current;
    void startListening().finally(() => { if (generation === callGeneration.current) autoStartRef.current = false; });
  }, [callStarted, callPrepared, avatarReady, avatarEnabled, startListening, state]);

  const endCall = () => {
    setCallStarted(false); avatarRef.current?.stop();
    captureRef.current?.port.postMessage({ active: false });
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    if (socketRef.current?.readyState === WebSocket.OPEN) sendControl("session.close");
    updateState("closed");
  };

  const statusText = error ?? (state === "ready" && callStarted && microphoneReady ? "正在聆听，请直接说话" : state === "listening" ? turnCopy[turnPhase] : stateCopy[state]);


  const toggleMute = () => {
    const next=!mutedRef.current;
    // Finalize already spoken input before muting; never send captured speech after unmute.
    if(next&&stateRef.current==="listening")commitDetectedTurn();
    mutedRef.current=next;setMuted(next);preRollRef.current=[];detectorRef.current.reset();
    streamRef.current?.getAudioTracks().forEach(track=>{track.enabled=!next;});
    captureRef.current?.port.postMessage({active:!next&&stateRef.current==="ready"});
  };
  const waiting=!answered;
  const ended=answered&&!callStarted;
  const seconds=clock.elapsedSeconds;
  return <main className="call-room">
    <div className="call-backdrop" style={{backgroundImage:`url(/api/avatars/${avatar.id}/source.jpg)`}}/>
    <div className="call-picture">
      {callPrepared&&callStarted&&avatarEnabled
        ? <iframe ref={avatarFrameRef} title="照片数字人" src={frameSrc} allow="autoplay"/>
        : <img src={`/api/avatars/${avatar.id}/source.jpg`} alt={avatar.name}/>}
      {!avatarEnabled&&<div className="audio-only"><span>画面暂不可用</span><strong>已切换纯语音通话</strong></div>}
    </div>
    <header className="call-header"><span className="ai-label">AI 数字人</span><h1>{avatar.name}</h1>
      <p role="status">{waiting?"准备好后，点击接听开始通话":ended?(error??"通话已结束"):!callPrepared?"正在准备通话…":statusText}</p>
      {activated.current&&<time>{String(Math.floor(seconds/60)).padStart(2,"0")}:{String(seconds%60).padStart(2,"0")}</time>}
    </header>
    {callStarted&&clock.idleRemaining<=10&&clock.maxRemaining>10&&<div className="call-warning" role="alert">长时间未讲话，{clock.idleRemaining} 秒后挂断
      <button onClick={()=>sendControl("session.continue")}>继续通话</button></div>}
    {callStarted&&clock.maxRemaining<=10&&<div className="call-limit" role="alert">本次通话将在 {clock.maxRemaining} 秒后结束</div>}
    <footer className="call-controls">
      {waiting?<><button className="round-control" onClick={onExit}><span aria-hidden="true">←</span>返回</button>
        <button className="round-control answer" onClick={()=>{if(answerLock.current)return;answerLock.current=true;setAnswered(true);setCallStarted(true);}}><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.7 15.7 0 006.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 013 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1z"/></svg></span>接听</button>
        <p className="turn-hint">接听后使用麦克风，无需摄像头</p></>:ended?<><button className="return-button" onClick={onExit}>返回人物列表</button><p>后台人物制作将继续。</p></>:
      <><button className={`round-control ${muted?"muted":""}`} aria-pressed={muted} onClick={toggleMute} disabled={!microphoneReady}>
        <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/>{muted&&<path d="M3 3l18 18"/>}</svg></span>{muted?"取消静音":"麦克风"}</button>
      <button className="round-control hangup" onClick={()=>{endCall();onExit();}}><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 10c5-5 15-5 20 0l-2 5-5-2v-3a15 15 0 00-6 0v3l-5 2z"/></svg></span>{callPrepared?"挂断":"取消呼叫"}</button>
      <p className="turn-hint">{muted?"麦克风已静音":state==="speaking"?"对方正在回复，请稍候":"说完后停顿 1.2 秒，等待对方回复"}</p></>}
    </footer>
    {diagnosticId&&<details className="call-diagnostics"><summary>故障诊断</summary><p>{diagnosticId}</p><p>{avatarStatus}</p></details>}
  </main>;
}
