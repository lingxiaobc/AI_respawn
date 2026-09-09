/* App-owned bridge. The vendor renderer/WASM remain isolated in this frame. */
const output = (type, extra = {}) => parent.postMessage({ source: "dh-live", type, ...extra }, location.origin);
let context;
let playing;
let queue = [];
let round = 0;
let ended = false;
let ready = false;
let started = false;
let frames = 0;
let maxBlend = 0;
let lastBlend = [];
let failed = false;
let bytesQueued = 0;
let samplesPlayed = 0, playbackStart = 0, previousEnd = 0, maxGapMs = 0;
let lastPlayback = null;
window.avatarStats = () => ({ ready, round, queued: queue.length, playing: !!playing, frames, maxBlend, lastBlend, lastPlayback });
function stop() {
  queue = []; bytesQueued = 0; ended = false; started = false;
  samplesPlayed = 0; playbackStart = 0; previousEnd = 0; maxGapMs = 0;
  if (playing) { playing.onended = null; playing.stop(); playing.disconnect(); playing = null; }
  if (ready) Module._clearAudio();
}
function fail(error) {
  if (failed) return;
  failed = true; stop();
  ready = false;
  console.error("DH_live runtime:", error);
  document.getElementById("loadingSpinner").style.display = "none";
  document.getElementById("startMessage").style.display = "block";
  const message = error?.message || (typeof error === "string" ? error : "人物资源加载失败，请检查资源或重新制作人物");
  document.getElementById("startMessage").textContent = "人物加载或播放失败：" + message;
  output("error", { message: String(message).slice(0, 200) });
}
window.addEventListener("error", event => fail(event.error || event.message));
window.addEventListener("unhandledrejection", event => fail(event.reason));
async function pump() {
  if (playing || !ready || failed) return;
  if (!queue.length) {
    if (ended) {
      ended = false; Module._clearAudio();
      lastPlayback = { round, samples: samplesPlayed, audioSeconds: samplesPlayed / 16_000,
        elapsedSeconds: previousEnd - playbackStart, maxGapMs };
      output("done", { round });
    }
    return;
  }
  try {
    context ??= new AudioContext({ sampleRate: 16_000 });
    await context.resume();
    if (playing || !queue.length) return;
    const wav = queue.shift(); bytesQueued -= wav.byteLength;
    const data = new DataView(wav);
    const samples = (wav.byteLength - 44) / 2;
    const buffer = context.createBuffer(1, samples, 16_000);
    const floats = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) floats[i] = data.getInt16(44 + 2 * i, true) / 32768;
    const ptr = Module._malloc(wav.byteLength);
    try { Module.HEAPU8.set(new Uint8Array(wav), ptr); Module._setAudioBuffer(ptr, wav.byteLength); }
    finally { Module._free(ptr); }
    const source = context.createBufferSource(); source.buffer = buffer;
    source.connect(context.destination); playing = source;
    source.onended = () => { source.disconnect(); playing = null; void pump(); };
    const startsAt = context.currentTime;
    if (!started) playbackStart = startsAt;
    if (previousEnd) maxGapMs = Math.max(maxGapMs, (startsAt - previousEnd) * 1000);
    samplesPlayed += samples; previousEnd = startsAt + buffer.duration;
    source.start(startsAt);
    if (!started) { started = true; output("started", { round }); }
  } catch (error) { fail(error); }
}
window.addEventListener("message", event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.source !== "respawn") return;
  const message = event.data;
  if (message.type === "stop") { stop(); round = message.round; return; }
  if (message.type === "begin") { stop(); round = message.round; return; }
  if (message.round !== round || failed) return;
  if (message.type === "audio" && message.wav instanceof ArrayBuffer) {
    if (message.wav.byteLength < 46 || message.wav.byteLength > 32_044) return fail(new Error("Invalid audio segment"));
    bytesQueued += message.wav.byteLength;
    if (bytesQueued > 1_000_000) return fail(new Error("Avatar audio queue exceeded limit"));
    queue.push(message.wav); void pump();
  }
  if (message.type === "end") { ended = true; void pump(); }
});
async function boot() {
  if (!gl) throw new Error("WebGL2 is unavailable");
  await qtLoad({ qt: { entryFunction: window.createQtAppInstance, containerElements: [document.getElementById("screen")] } });
  // Emscripten replaces its lazy export on first invocation. Resolve it before wrapping.
  const probe = Module._malloc(48);
  Module._updateBlendShape(probe, 48); Module._free(probe);
  const originalUpdate = Module._updateBlendShape;
  Module._updateBlendShape = (ptr, size) => {
    const result = originalUpdate(ptr, size);
    frames++;
    const values = new Float32Array(Module.HEAPU8.buffer, ptr, 12);
    lastBlend = Array.from(values);
    maxBlend = Math.max(maxBlend, ...values.map(Math.abs));
    return result;
  };
  await newVideoTask();
  ready = true;
  document.getElementById("loadingSpinner").style.display = "none";
  output("ready");
}
void boot().catch(fail);
