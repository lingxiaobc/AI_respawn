export interface EnvelopeTiming {
  attackMs: number;
  releaseMs: number;
}

export const DEFAULT_ENVELOPE_TIMING: EnvelopeTiming = {
  attackMs: 42,
  releaseMs: 115,
};

export function calculateRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

export function rmsToMouthOpen(rms: number, noiseFloor = 0.012, fullScale = 0.135): number {
  if (!Number.isFinite(rms) || rms <= noiseFloor) return 0;
  const normalized = Math.min(1, (rms - noiseFloor) / Math.max(0.001, fullScale - noiseFloor));
  return Math.pow(normalized, 0.72);
}

export class AudioEnvelopeFollower {
  value = 0;
  private readonly timing: EnvelopeTiming;

  constructor(timing: EnvelopeTiming = DEFAULT_ENVELOPE_TIMING) {
    this.timing = timing;
  }

  update(target: number, elapsedMs: number): number {
    const safeTarget = Math.min(1, Math.max(0, Number.isFinite(target) ? target : 0));
    const timeMs = safeTarget > this.value ? this.timing.attackMs : this.timing.releaseMs;
    const coefficient = 1 - Math.exp(-Math.max(0, elapsedMs) / Math.max(1, timeMs));
    this.value += (safeTarget - this.value) * coefficient;
    if (this.value < 0.001 && safeTarget === 0) this.value = 0;
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}
