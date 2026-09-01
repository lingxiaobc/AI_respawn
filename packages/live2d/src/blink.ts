export interface BlinkTiming {
  closeMs: number;
  holdMs: number;
  openMs: number;
  minIntervalMs: number;
  maxIntervalMs: number;
}

export const DEFAULT_BLINK_TIMING: BlinkTiming = {
  closeMs: 75,
  holdMs: 35,
  openMs: 90,
  minIntervalMs: 2_400,
  maxIntervalMs: 5_800,
};

export class BlinkController {
  private readonly timing: BlinkTiming;
  private readonly random: () => number;
  private blinkStartedAt: number | null = null;
  private nextBlinkAt: number;

  constructor(nowMs: number, random: () => number = Math.random, timing: BlinkTiming = DEFAULT_BLINK_TIMING) {
    this.random = random;
    this.timing = timing;
    this.nextBlinkAt = nowMs + this.randomInterval();
  }

  update(nowMs: number): number {
    if (this.blinkStartedAt === null) {
      if (nowMs < this.nextBlinkAt) return 1;
      this.blinkStartedAt = nowMs;
    }

    const elapsed = Math.max(0, nowMs - this.blinkStartedAt);
    if (elapsed < this.timing.closeMs) return 1 - elapsed / this.timing.closeMs;
    if (elapsed < this.timing.closeMs + this.timing.holdMs) return 0;
    const openingElapsed = elapsed - this.timing.closeMs - this.timing.holdMs;
    if (openingElapsed < this.timing.openMs) return openingElapsed / this.timing.openMs;

    this.blinkStartedAt = null;
    this.nextBlinkAt = nowMs + this.randomInterval();
    return 1;
  }

  private randomInterval(): number {
    const unit = Math.min(1, Math.max(0, this.random()));
    return this.timing.minIntervalMs + unit * (this.timing.maxIntervalMs - this.timing.minIntervalMs);
  }
}
