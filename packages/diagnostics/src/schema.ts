import { randomUUID } from "node:crypto";

export const DIAGNOSTIC_EVENTS = [
  "session_started",
  "state_transition",
  "round_started",
  "milestone",
  "provider_event",
  "round_completed",
  "round_aborted",
  "error",
  "session_closed",
] as const;

export type DiagnosticEvent = (typeof DIAGNOSTIC_EVENTS)[number];
export type DiagnosticLevel = "info" | "warn" | "error";
export type DiagnosticComponent = "browser" | "gateway" | "provider" | "probe" | "ptt";
export type DiagnosticResult = "ok" | "error" | "closed" | "aborted";

export interface DiagnosticIdentity {
  sessionId: string;
  diagnosticId: string;
}

export interface DiagnosticRecordInput {
  event: DiagnosticEvent;
  component: DiagnosticComponent;
  level?: DiagnosticLevel;
  diagnostic_id: string;
  session_id: string;
  round?: number;
  state?: string;
  state_from?: string;
  state_to?: string;
  result?: DiagnosticResult;
  code?: string;
  message?: string;
  provider_event_id?: string;
  provider_event_type?: string;
  provider_logid?: string;
  provider_status?: number | string;
  provider_event_count?: number;
  provider_error_type?: string;
  provider_error_code?: string;
  provider_error_param?: string;
  provider_message?: string;
  event_direction?: "inbound" | "outbound";
  event_size_bytes?: number;
  socket_ready_state?: string;
  timer_name?: string;
  deadline_ms?: number;
  elapsed_ms?: number;
  phase_duration_ms?: number;
  pre_roll_frames?: number;
  voiced_frames?: number;
  silence_ms?: number;
  audio_idle_ms?: number;
  last_milestone?: string;
  rms_min?: number;
  rms_max?: number;
  rms_avg?: number;
  close_code?: number;
  close_reason?: string;
  input_frames?: number;
  input_bytes?: number;
  output_chunks?: number;
  output_pcm_bytes?: number;
  asr_completed?: boolean;
  commit_to_first_audio_ms?: number;
  round_duration_ms?: number;
}

export interface DiagnosticRecord extends DiagnosticRecordInput {
  schema_version: 2;
  ts: string;
  level: DiagnosticLevel;
}

const ALLOWED_FIELDS = new Set<string>([
  "event",
  "component",
  "level",
  "diagnostic_id",
  "session_id",
  "round",
  "state",
  "state_from",
  "state_to",
  "result",
  "code",
  "message",
  "provider_event_id",
  "provider_event_type",
  "provider_logid",
  "provider_status",
  "provider_event_count",
  "provider_error_type",
  "provider_error_code",
  "provider_error_param",
  "provider_message",
  "event_direction",
  "event_size_bytes",
  "socket_ready_state",
  "timer_name",
  "deadline_ms",
  "elapsed_ms",
  "phase_duration_ms",
  "pre_roll_frames",
  "voiced_frames",
  "silence_ms",
  "audio_idle_ms",
  "last_milestone",
  "rms_min",
  "rms_max",
  "rms_avg",
  "close_code",
  "close_reason",
  "input_frames",
  "input_bytes",
  "output_chunks",
  "output_pcm_bytes",
  "asr_completed",
  "commit_to_first_audio_ms",
  "round_duration_ms",
]);

const FORBIDDEN_MESSAGE_PATTERNS = [
  /(?:DOUBAO_API_KEY|X-Api-Key|Authorization)\s*[:=]\s*[^\s,;]+/gi,
  /(?:audio|delta|transcript|response|request|payload|base64|pcm)[\s_-]*(?:data|body|content)?\s*[:=]\s*[^\s,;]+/gi,
  /[A-Za-z0-9+/]{80,}={0,2}/g,
];

export function createSessionIdentity(): DiagnosticIdentity {
  const token = randomUUID();
  return { sessionId: `sess_${token}`, diagnosticId: token.slice(0, 8) };
}

export function sanitizeMessage(message: string): string {
  let result = message.slice(0, 500);
  for (const pattern of FORBIDDEN_MESSAGE_PATTERNS) result = result.replace(pattern, "[REDACTED]");
  return result;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 200) throw new Error(`Invalid diagnostic ${field}`);
  return value;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid diagnostic ${field}`);
  }
  return value;
}

export function createDiagnosticRecord(input: DiagnosticRecordInput, now = new Date()): DiagnosticRecord {
  for (const key of Object.keys(input)) {
    if (!ALLOWED_FIELDS.has(key)) throw new Error(`Unsupported diagnostic field: ${key}`);
  }
  if (!DIAGNOSTIC_EVENTS.includes(input.event)) throw new Error("Invalid diagnostic event");
  if (!input.diagnostic_id || !input.session_id) throw new Error("Diagnostic identity is required");

  const record: DiagnosticRecord = {
    schema_version: 2,
    ts: now.toISOString(),
    event: input.event,
    component: input.component,
    level: input.level ?? (input.event === "error" ? "error" : "info"),
    diagnostic_id: input.diagnostic_id,
    session_id: input.session_id,
  };

  const strings = [
    "state",
    "state_from",
    "state_to",
    "code",
    "provider_event_id",
    "provider_event_type",
    "provider_logid",
    "close_reason",
    "provider_error_type",
    "provider_error_code",
    "provider_error_param",
    "provider_message",
    "socket_ready_state",
    "timer_name",
    "last_milestone",
  ] as const;
  const sanitizedStrings = new Set([
    "close_reason",
    "code",
    "provider_message",
    "provider_error_type",
    "provider_error_code",
    "provider_error_param",
  ]);
  for (const field of strings) {
    const value = optionalString(input[field], field);
    if (value !== undefined) record[field] = sanitizedStrings.has(field) ? sanitizeMessage(value) : value;
  }
  if (input.message !== undefined) record.message = sanitizeMessage(input.message);
  if (input.event_direction !== undefined) {
    if (input.event_direction !== "inbound" && input.event_direction !== "outbound") {
      throw new Error("Invalid diagnostic event_direction");
    }
    record.event_direction = input.event_direction;
  }

  const numbers = [
    "round",
    "close_code",
    "input_frames",
    "input_bytes",
    "output_chunks",
    "output_pcm_bytes",
    "commit_to_first_audio_ms",
    "round_duration_ms",
    "event_size_bytes",
    "deadline_ms",
    "elapsed_ms",
    "phase_duration_ms",
    "pre_roll_frames",
    "voiced_frames",
    "silence_ms",
    "rms_min",
    "rms_max",
    "rms_avg",
    "provider_event_count",
    "audio_idle_ms",
  ] as const;
  for (const field of numbers) {
    const value = optionalNumber(input[field], field);
    if (value !== undefined) record[field] = value;
  }
  if (input.provider_status !== undefined) {
    if (typeof input.provider_status === "number") {
      record.provider_status = optionalNumber(input.provider_status, "provider_status");
    } else if (typeof input.provider_status === "string") {
      record.provider_status = sanitizeMessage(input.provider_status);
    } else {
      throw new Error("Invalid diagnostic provider_status");
    }
  }
  if (input.asr_completed !== undefined) {
    if (typeof input.asr_completed !== "boolean") throw new Error("Invalid diagnostic asr_completed");
    record.asr_completed = input.asr_completed;
  }
  if (input.result !== undefined) {
    if (!["ok", "error", "closed", "aborted"].includes(input.result)) throw new Error("Invalid diagnostic result");
    record.result = input.result;
  }
  return record;
}
