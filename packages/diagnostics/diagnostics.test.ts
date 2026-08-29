import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DiagnosticLogger } from "./src/logger.ts";
import { createDiagnosticRecord, sanitizeMessage, type DiagnosticRecordInput } from "./src/schema.ts";

test("diagnostic records keep a small allow-list and redact content-like values", () => {
  const record = createDiagnosticRecord({
    event: "error",
    component: "provider",
    diagnostic_id: "deadbeef",
    session_id: "sess-test",
    code: "UPSTREAM_CONNECT",
    message: "DOUBAO_API_KEY=secret response_body=YWJj",
  });
  assert.equal(record.message, "[REDACTED] [REDACTED]");
  const unsafe = {
    event: "error",
    component: "provider",
    diagnostic_id: "deadbeef",
    session_id: "sess-test",
    audio: "raw",
  } as unknown as DiagnosticRecordInput;
  assert.throws(
    () => createDiagnosticRecord(unsafe),
    /Unsupported diagnostic field: audio/,
  );
});

test("logger appends JSONL and retains only diagnostic metadata", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-respawn-diagnostics-"));
  try {
    const logger = new DiagnosticLogger({ directory, now: () => new Date("2026-08-30T12:00:00.000Z") });
    logger.write({
      event: "round_completed",
      component: "gateway",
      diagnostic_id: "deadbeef",
      session_id: "sess-test",
      round: 1,
      result: "ok",
      input_frames: 10,
      output_chunks: 3,
      output_pcm_bytes: 960,
      commit_to_first_audio_ms: 120,
    });
    const path = join(directory, "diagnostics-2026-08-30.jsonl");
    const lines = readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, "round_completed");
    assert.equal(lines[0].output_pcm_bytes, 960);
    assert.equal("audio" in lines[0], false);
    assert.equal("message" in lines[0], false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("logger prunes dated files beyond the retention window", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-respawn-diagnostics-retention-"));
  try {
    const oldPath = join(directory, "diagnostics-2026-08-20.jsonl");
    writeFileSync(oldPath, "{}\n");
    const logger = new DiagnosticLogger({ directory, retentionDays: 7, now: () => new Date("2026-08-30T12:00:00.000Z") });
    logger.write({
      event: "session_started",
      component: "gateway",
      diagnostic_id: "deadbeef",
      session_id: "sess-test",
    });
    assert.equal(existsSync(oldPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("minimal failure records cover transport and playback phases without payloads", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-respawn-diagnostics-failures-"));
  try {
    const logger = new DiagnosticLogger({ directory, now: () => new Date("2026-08-30T12:00:00.000Z") });
    for (const [component, code] of [
      ["gateway", "UPSTREAM_TIMEOUT"],
      ["provider", "UPSTREAM_EVENT"],
      ["browser", "BROWSER_SOCKET_ERROR"],
      ["browser", "PLAYBACK_INTERRUPTED"],
    ] as const) {
      logger.write({
        event: "error",
        component,
        diagnostic_id: "deadbeef",
        session_id: "sess-test",
        round: 1,
        code,
        message: "diagnostic failure",
      });
    }
    const content = readFileSync(join(directory, "diagnostics-2026-08-30.jsonl"), "utf8");
    assert.equal(content.split("\n").filter(Boolean).length, 4);
    assert.equal(/audio|transcript|base64|api.?key/i.test(content), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("logger degrades when its directory is not writable", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-respawn-diagnostics-file-"));
  const filePath = join(directory, "not-a-directory");
  writeFileSync(filePath, "x");
  try {
    const failures: Error[] = [];
    const logger = new DiagnosticLogger({ directory: filePath, onWriteFailure: (error) => failures.push(error) });
    assert.doesNotThrow(() => logger.write({
      event: "session_started",
      component: "gateway",
      diagnostic_id: "deadbeef",
      session_id: "sess-test",
    }));
    assert.equal(failures.length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("message sanitizer is bounded", () => {
  assert.ok(sanitizeMessage("x".repeat(1_000)).length <= 500);
});
