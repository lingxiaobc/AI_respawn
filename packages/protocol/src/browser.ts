export type GatewayState =
  | "connecting"
  | "ready"
  | "listening"
  | "thinking"
  | "speaking"
  | "closing"
  | "closed"
  | "error";

export type BrowserControl =
  | { type: "ptt.start" }
  | { type: "ptt.commit" }
  | { type: "playback.done" }
  | { type: "session.close" };

export interface GatewayMessage {
  type: "state" | "turn" | "error";
  state?: GatewayState;
  event?: "asr.completed" | "audio.done" | "response.done";
  round?: number;
  code?: string;
  message?: string;
}

const CONTROL_TYPES = new Set(["ptt.start", "ptt.commit", "playback.done", "session.close"]);

export function parseBrowserControl(raw: string): BrowserControl {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("Browser control is missing type");
  }
  const type = (value as { type?: unknown }).type;
  if (typeof type !== "string" || !CONTROL_TYPES.has(type)) {
    throw new Error("Browser control type is not allowed");
  }
  return { type } as BrowserControl;
}

export function canTransition(from: GatewayState, to: GatewayState): boolean {
  if (to === "error" || to === "closing") return !["closed", "closing"].includes(from);
  const allowed: Partial<Record<GatewayState, GatewayState[]>> = {
    connecting: ["ready"],
    ready: ["listening"],
    listening: ["thinking"],
    thinking: ["speaking"],
    speaking: ["ready"],
    closing: ["closed"],
  };
  return allowed[from]?.includes(to) ?? false;
}
