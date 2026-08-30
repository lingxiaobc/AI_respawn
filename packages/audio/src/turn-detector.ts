export type TurnDetectorState = "waiting" | "speaking" | "silence";
export type TurnDetectorEvent = "speech-start" | "turn-end";

export interface TurnDetectorConfig {
  speechThreshold: number;
  minSpeechDurationMs: number;
  silenceTimeoutMs: number;
  maxTurnDurationMs: number;
  frameDurationMs: number;
}

export const DEFAULT_TURN_DETECTOR_CONFIG: Readonly<TurnDetectorConfig> = {
  speechThreshold: 0.02,
  minSpeechDurationMs: 200,
  silenceTimeoutMs: 1_200,
  maxTurnDurationMs: 30_000,
  frameDurationMs: 20,
};

export function pcm16Rms(frame: Int16Array): number {
  if (frame.length === 0) return 0;
  let sumSquares = 0;
  for (const sample of frame) {
    const normalized = sample / 32768;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / frame.length);
}

export class TurnDetector {
  readonly #config: Readonly<TurnDetectorConfig>;
  #state: TurnDetectorState = "waiting";
  #speechDurationMs = 0;
  #silenceDurationMs = 0;
  #turnDurationMs = 0;

  constructor(config: Partial<TurnDetectorConfig> = {}) {
    this.#config = { ...DEFAULT_TURN_DETECTOR_CONFIG, ...config };
    if (this.#config.speechThreshold < 0 || this.#config.speechThreshold > 1) {
      throw new Error("speechThreshold must be between 0 and 1");
    }
    if (this.#config.minSpeechDurationMs <= 0 || this.#config.silenceTimeoutMs <= 0) {
      throw new Error("Speech and silence durations must be positive");
    }
    if (this.#config.maxTurnDurationMs < this.#config.minSpeechDurationMs) {
      throw new Error("maxTurnDurationMs must cover minSpeechDurationMs");
    }
    if (this.#config.frameDurationMs <= 0) throw new Error("frameDurationMs must be positive");
  }

  get state(): TurnDetectorState {
    return this.#state;
  }

  get config(): Readonly<TurnDetectorConfig> {
    return this.#config;
  }

  push(frame: Int16Array): TurnDetectorEvent[] {
    return this.pushRms(pcm16Rms(frame));
  }

  pushRms(rms: number, durationMs = this.#config.frameDurationMs): TurnDetectorEvent[] {
    if (!Number.isFinite(rms) || rms < 0) throw new Error("Audio RMS must be a finite non-negative number");
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("Frame duration must be positive");

    const voiced = rms >= this.#config.speechThreshold;
    const events: TurnDetectorEvent[] = [];

    if (this.#state === "waiting") {
      if (!voiced) {
        this.#speechDurationMs = 0;
        return events;
      }
      this.#speechDurationMs += durationMs;
      if (this.#speechDurationMs < this.#config.minSpeechDurationMs) return events;
      this.#state = "speaking";
      this.#turnDurationMs = this.#speechDurationMs;
      this.#silenceDurationMs = 0;
      events.push("speech-start");
      return events;
    }

    this.#turnDurationMs += durationMs;
    if (voiced) {
      this.#silenceDurationMs = 0;
      this.#state = "speaking";
    } else {
      this.#silenceDurationMs += durationMs;
      this.#state = "silence";
    }

    if (
      this.#silenceDurationMs >= this.#config.silenceTimeoutMs
      || this.#turnDurationMs >= this.#config.maxTurnDurationMs
    ) {
      events.push("turn-end");
      this.reset();
    }
    return events;
  }

  reset(): void {
    this.#state = "waiting";
    this.#speechDurationMs = 0;
    this.#silenceDurationMs = 0;
    this.#turnDurationMs = 0;
  }
}
