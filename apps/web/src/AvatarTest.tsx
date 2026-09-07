import { useEffect, useRef, useState } from "react";
import { AvatarPlayer } from "./avatar-player.ts";
import type { GatewayMessage } from "../../../packages/protocol/src/browser.ts";

/** Fixed-input integration harness; explicitly started, never records the microphone. */
export function AvatarTest() {
  const frame = useRef<HTMLIFrameElement>(null);
  const player = useRef<AvatarPlayer | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const add = (text: string) => setLog(items => [...items, text]);
  const stop = () => {
    clearTimeout(timer.current); clearTimeout(inputTimer.current);
    socket.current?.close(); socket.current = null;
    player.current?.stop(); setRunning(false);
  };
  useEffect(() => {
    const instance = new AvatarPlayer(frame.current!, (event, message) => {
      if (event === "ready") setReady(true);
      if (event === "started") add("avatar.started");
      if (event === "done" && socket.current?.readyState === WebSocket.OPEN) {
        add("avatar.done → playback.done");
        socket.current.send(JSON.stringify({ type: "playback.done" }));
      }
      if (event === "error") { add(`FAIL: ${message}`); setReady(false); stop(); }
    });
    player.current = instance;
    return () => { stop(); instance.dispose(); };
  }, []);
  const start = async () => {
    if (!player.current?.ready || running) return;
    setRunning(true); setLog([]);
    let decoder: AudioContext | undefined;
    try {
      decoder = new AudioContext({ sampleRate: 16_000 });
      const response = await fetch("/dh-live/common/input.wav");
      if (!response.ok) throw new Error("Fixture unavailable");
      const audio = await decoder.decodeAudioData(await response.arrayBuffer());
      const pcm = Int16Array.from(audio.getChannelData(0), value => Math.round(Math.max(-1, Math.min(1, value)) * 32767));
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`);
      socket.current = ws; ws.binaryType = "arraybuffer";
      let completed = 0, bytes = 0, began = false, asr = false;
      timer.current = setTimeout(() => { add("FAIL: 180s timeout"); stop(); }, 180_000);
      ws.onmessage = event => {
        if (event.data instanceof ArrayBuffer) {
          if (!began) { player.current!.begin(); began = true; }
          bytes += event.data.byteLength; player.current!.push(event.data); return;
        }
        const message = JSON.parse(String(event.data)) as GatewayMessage;
        if (message.type === "error") { add(`FAIL: ${message.code}: ${message.message}`); stop(); return; }
        if (message.type === "turn" && message.event === "asr.completed") asr = true;
        if (message.type === "turn" && message.event === "audio.done") {
          if (!began) { add("FAIL: No output audio"); stop(); return; }
          add(`audio.done: ${bytes} bytes`); player.current!.finish();
        }
        if (message.type !== "state" || message.state !== "ready") return;
        if (began) {
          completed++; add(`ROUND ${completed}: ready, ASR=${asr}, PCM=${bytes}`);
          if (!asr || !bytes) { add("FAIL: incomplete response"); stop(); return; }
        }
        if (completed === 3) { add("PASS: 3 real provider rounds rendered and drained"); stop(); return; }
        began = false; bytes = 0; asr = false;
        ws.send(JSON.stringify({ type: "ptt.start" }));
        let offset = 0;
        const send = () => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (offset >= pcm.length) { ws.send(JSON.stringify({ type: "ptt.commit" })); return; }
          const segment = new Int16Array(320);
          segment.set(pcm.subarray(offset, offset + 320)); ws.send(segment); offset += 320;
          inputTimer.current = setTimeout(send, 20);
        };
        send();
      };
      ws.onerror = () => { add("FAIL: Gateway socket error"); stop(); };
      ws.onclose = () => { if (socket.current === ws) { add("FAIL: Unexpected close"); stop(); } };
    } catch (error) { add(`FAIL: ${String(error)}`); stop(); }
    finally { await decoder?.close(); }
  };
  return <main className="shell">
    <h1>数字人集成测试</h1>
    <p>固定公开语音输入，连续三轮豆包真实调用；按现有 API 用量计费，不使用麦克风。</p>
    <div className="avatar-stage"><iframe ref={frame} title="测试数字人" src="/dh-live/frame.html" allow="autoplay" /></div>
    <div className="avatar-actions">
      <button disabled={!ready || running} onClick={() => void start()}>运行三轮豆包测试</button>
      <button disabled={!running} onClick={stop}>停止测试</button>
      <a href="/">返回通话页面</a>
    </div>
    <pre role="log" style={{ whiteSpace: "pre-wrap" }}>{log.join("\n")}</pre>
  </main>;
}
