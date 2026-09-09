import { useEffect, useRef, useState } from "react";
import { AvatarPlayer } from "./avatar-player.ts";
import type { GatewayMessage } from "../../../packages/protocol/src/browser.ts";

/** Fixed-input integration harness; explicitly started, never records the microphone. */
export function AvatarTest() {
  const candidate = new URLSearchParams(location.search).get("avatar");
  const avatarId = candidate && /^[a-f0-9-]{36}$/.test(candidate) ? candidate : null;
  const frameSrc = avatarId ? `/api/avatars/${avatarId}/frame.html` : "/dh-live/frame.html";
  const frame = useRef<HTMLIFrameElement>(null);
  const player = useRef<AvatarPlayer | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const observationTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const observed = useRef({ inside: 0, outside: 0, samples: 0, changedFrames: 0 });
  const observingAudio = useRef(false);
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const add = (text: string) => setLog(items => [...items, text]);
  const stop = () => {
    generation.current++; abortRef.current?.abort(); observingAudio.current = false;
    clearTimeout(timer.current); clearTimeout(inputTimer.current);
    clearInterval(observationTimer.current);
    socket.current?.close(); socket.current = null;
    player.current?.stop(); setRunning(false);
  };
  useEffect(() => {
    const instance = new AvatarPlayer(frame.current!, (event, message) => {
      if (event === "ready") setReady(true);
      if (event === "started") add("avatar.started");
      if (event === "done" && socket.current?.readyState === WebSocket.OPEN) {
        observingAudio.current = false;
        const stats = (frame.current!.contentWindow as Window & { avatarStats?: () => unknown }).avatarStats?.();
        add(`PLAYBACK ${JSON.stringify(stats)}\nPIXELS ${JSON.stringify(observed.current)}`);
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
    const run = ++generation.current;
    const abort = new AbortController(); abortRef.current = abort;
    const active = () => run === generation.current && !abort.signal.aborted;
    setRunning(true); setLog([]);
    let decoder: AudioContext | undefined;
    try {
      decoder = new AudioContext({ sampleRate: 16_000 });
      const response = await fetch("/dh-live/common/input.wav", { signal: abort.signal });
      if (!response.ok) throw new Error("Fixture unavailable");
      const audio = await decoder.decodeAudioData(await response.arrayBuffer());
      if (!active()) return;
      const pcm = Int16Array.from(audio.getChannelData(0), value => Math.round(Math.max(-1, Math.min(1, value)) * 32767));
      if (avatarId) {
        const profile = await (await fetch(`/api/avatars/${avatarId}/profile.json`, { signal: abort.signal })).json() as {
          mouth: { x: number; y: number; rx: number; ry: number; angle: number } };
        if (!active()) return;
        const canvas = frame.current!.contentDocument!.getElementById("canvas_video") as HTMLCanvasElement;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const baseline = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let previous = baseline;
        observed.current = { inside: 0, outside: 0, samples: 0, changedFrames: 0 };
        observationTimer.current = setInterval(() => {
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data, m = profile.mouth;
          let inside = 0, outside = 0;
          const cos = Math.cos(m.angle), sin = Math.sin(m.angle);
          for (let p = 0; p < pixels.length; p += 4) {
            if (pixels[p] === baseline[p] && pixels[p+1] === baseline[p+1] && pixels[p+2] === baseline[p+2] && pixels[p+3] === baseline[p+3]
              && pixels[p] === previous[p] && pixels[p+1] === previous[p+1] && pixels[p+2] === previous[p+2] && pixels[p+3] === previous[p+3]) continue;
            const x = (p / 4) % canvas.width - m.x, y = Math.floor(p / 4 / canvas.width) - m.y;
            const u = x * cos + y * sin, v = -x * sin + y * cos;
            const inMouth = (u / (m.rx + 2)) ** 2 + (v / (m.ry + 2)) ** 2 <= 1;
            const reference = inMouth ? previous : baseline;
            const changed = pixels[p] !== reference[p] || pixels[p + 1] !== reference[p + 1] || pixels[p + 2] !== reference[p + 2] || pixels[p + 3] !== reference[p + 3];
            if (changed) { if (inMouth) inside++; else outside++; }
          }
          previous = pixels;
          if (!observingAudio.current) return;
          observed.current.inside = Math.max(observed.current.inside, inside);
          observed.current.outside = Math.max(observed.current.outside, outside); observed.current.samples++;
          if (inside > 0) observed.current.changedFrames++;
        }, 200);
      }
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws${avatarId ? `?avatar=${avatarId}` : ""}`);
      socket.current = ws; ws.binaryType = "arraybuffer";
      let completed = 0, bytes = 0, began = false, asr = false;
      timer.current = setTimeout(() => { add("FAIL: 180s timeout"); stop(); }, 180_000);
      ws.onmessage = event => {
        if (!active() || socket.current !== ws) return;
        if (event.data instanceof ArrayBuffer) {
          if (!began) { player.current!.begin(); began = true; observingAudio.current = true; }
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
          if (avatarId && (observed.current.changedFrames < 2 || observed.current.outside !== 0)) {
            add("FAIL: per-round mouth motion or static-region check"); stop(); return;
          }
        }
        if (completed === 3) {
          const visual = !avatarId || (observed.current.inside > 0 && observed.current.outside === 0);
          add(visual ? "PASS: 3 real provider rounds rendered and drained" : "FAIL: mouth motion or static-region check"); stop(); return;
        }
        began = false; bytes = 0; asr = false;
        observed.current = { inside: 0, outside: 0, samples: 0, changedFrames: 0 };
        ws.send(JSON.stringify({ type: "ptt.start" }));
        let offset = 0;
        const send = () => {
          if (!active() || ws.readyState !== WebSocket.OPEN) return;
          if (offset >= pcm.length) { ws.send(JSON.stringify({ type: "ptt.commit" })); return; }
          const segment = new Int16Array(320);
          segment.set(pcm.subarray(offset, offset + 320)); ws.send(segment); offset += 320;
          inputTimer.current = setTimeout(send, 20);
        };
        send();
      };
      ws.onerror = () => { if (active()) { add("FAIL: Gateway socket error"); stop(); } };
      ws.onclose = () => { if (active() && socket.current === ws) { add("FAIL: Unexpected close"); stop(); } };
    } catch (error) { if (active()) { add(`FAIL: ${String(error)}`); stop(); } }
    finally { await decoder?.close(); }
  };
  return <main className="shell">
    <h1>数字人集成测试</h1>
    <p>固定公开语音输入，连续三轮豆包真实调用；按现有 API 用量计费，不使用麦克风。</p>
    <p>人物：{avatarId ?? "固定示例"}</p>
    <div className="avatar-stage"><iframe ref={frame} title="测试数字人" src={frameSrc} allow="autoplay" /></div>
    <div className="avatar-actions">
      <button disabled={!ready || running} onClick={() => void start()}>运行三轮豆包测试</button>
      <button disabled={!running} onClick={stop}>停止测试</button>
      <a href="/">返回通话页面</a>
    </div>
    <pre role="log" style={{ whiteSpace: "pre-wrap" }}>{log.join("\n")}</pre>
  </main>;
}
