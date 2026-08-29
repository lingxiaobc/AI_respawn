import { randomUUID } from "node:crypto";

export const DEFAULT_DOUBAO_URL =
  "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue";
export const DEFAULT_DOUBAO_MODEL = "1.2.6.1";
export const DEFAULT_DOUBAO_VOICE = "zh_female_vv_jupiter_bigtts";

export interface SessionConfig {
  model?: string;
  voice?: string;
  instructions: string;
}

export interface ServerEvent {
  type: string;
  event_id?: string;
  delta?: string;
  [key: string]: unknown;
}

export function eventId(): string {
  return `event_${randomUUID()}`;
}

export function createSessionEvent(config: SessionConfig) {
  return {
    type: "session.create",
    event_id: eventId(),
    session: {
      model: config.model ?? DEFAULT_DOUBAO_MODEL,
      instructions: config.instructions,
      audio: {
        input: { format: { type: "pcm", rate: 16_000 } },
        output: {
          format: { type: "pcm", rate: 24_000 },
          voice: config.voice ?? DEFAULT_DOUBAO_VOICE,
          speed: 0,
          loudness: 0,
        },
      },
    },
    extension: { asr: {}, tts: {}, dialog: {} },
  } as const;
}

export function createAudioAppendEvent(pcm: Uint8Array) {
  return {
    type: "input_audio_buffer.append",
    event_id: eventId(),
    audio: Buffer.from(pcm).toString("base64"),
  } as const;
}

export function createCommitEvent() {
  return { type: "input_audio_buffer.commit", event_id: eventId() } as const;
}

export function createMuteEvent() {
  return { type: "input_audio_mute.commit", event_id: eventId() } as const;
}

export function createUnmuteEvent() {
  return { type: "input_audio_unmute.commit", event_id: eventId() } as const;
}

export function createCloseEvent() {
  return { type: "session.close", event_id: eventId() } as const;
}

export function parseServerEvent(raw: string): ServerEvent {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("Provider frame is missing a string type field");
  }

  const candidate = value as { type?: unknown };
  if (typeof candidate.type !== "string" || candidate.type.length === 0) {
    throw new Error("Provider frame has an invalid type field");
  }
  return value as ServerEvent;
}

export function safeEventSummary(event: ServerEvent) {
  return {
    type: event.type,
    event_id: typeof event.event_id === "string" ? event.event_id : undefined,
    status_code:
      typeof event.status_code === "number" || typeof event.status_code === "string"
        ? event.status_code
        : undefined,
    message: typeof event.message === "string" ? event.message : undefined,
    audio_bytes:
      event.type === "response.output_audio.delta" && typeof event.delta === "string"
        ? Buffer.from(event.delta, "base64").byteLength
        : undefined,
  };
}
