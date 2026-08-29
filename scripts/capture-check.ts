import { setTimeout as delay } from "node:timers/promises";
import { PvRecorder } from "@picovoice/pvrecorder-node";

const frameLength = 320;
const durationMs = 4_000;
const recorder = new PvRecorder(frameLength);
let frames = 0;
let peak = 0;
let sumSquares = 0;
let samples = 0;

try {
  console.log("麦克风检查开始：请连续说话 4 秒……");
  recorder.start();
  const deadline = performance.now() + durationMs;
  while (performance.now() < deadline) {
    const frame = await recorder.read();
    frames += 1;
    samples += frame.length;
    for (const sample of frame) {
      peak = Math.max(peak, Math.abs(sample));
      sumSquares += sample * sample;
    }
  }
  recorder.stop();
  await delay(50);
  const rms = samples > 0 ? Math.round(Math.sqrt(sumSquares / samples)) : 0;
  console.log(
    JSON.stringify({
      type: "capture-check",
      device: recorder.getSelectedDevice(),
      sample_rate: recorder.sampleRate,
      frame_samples: frameLength,
      frames,
      duration_ms: Math.round((frames * frameLength * 1000) / recorder.sampleRate),
      peak,
      rms,
      non_silent: peak > 64 && rms > 8,
    }),
  );
  if (peak <= 64 || rms <= 8) process.exitCode = 2;
} finally {
  if (recorder.isRecording) recorder.stop();
  recorder.release();
}
