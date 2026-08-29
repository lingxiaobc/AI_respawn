export function downsampleAveraged(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate < outputRate) throw new Error("Upsampling is not supported");
  if (inputRate <= 0 || outputRate <= 0) throw new Error("Sample rates must be positive");
  const ratio = inputRate / outputRate;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.max(start + 1, Math.floor((outputIndex + 1) * ratio));
    let sum = 0;
    for (let inputIndex = start; inputIndex < Math.min(end, input.length); inputIndex += 1) {
      sum += input[inputIndex]!;
    }
    output[outputIndex] = Math.max(-1, Math.min(1, sum / (end - start)));
  }
  return output;
}

export function nextPlaybackStart(currentTime: number, queuedUntil: number, leadSeconds = 0.035): number {
  if (currentTime < 0 || queuedUntil < 0 || leadSeconds < 0) throw new Error("Playback times cannot be negative");
  return Math.max(currentTime + leadSeconds, queuedUntil);
}
