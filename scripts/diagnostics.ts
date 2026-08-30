import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadLocalEnv } from "./env.ts";

await loadLocalEnv();

const directory = resolve(process.env.DIAGNOSTICS_DIR ?? "logs");
const id = process.argv.find((arg) => arg.startsWith("--id="))?.slice(5);
const session = process.argv.find((arg) => arg.startsWith("--session="))?.slice(10);
const exportPath = process.argv.find((arg) => arg.startsWith("--export="))?.slice(9);
const tailRaw = process.argv.find((arg) => arg.startsWith("--tail="))?.slice(7);
const tail = tailRaw === undefined ? 50 : Number.parseInt(tailRaw, 10);
if (!Number.isInteger(tail) || tail < 1 || tail > 1_000) throw new Error("--tail must be between 1 and 1000");

let files: string[] = [];
try {
  files = (await readdir(directory))
    .filter((name) => /^diagnostics-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .sort();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const records: string[] = [];
let invalidLines = 0;
const invalidLineNumbers: string[] = [];
for (const file of files) {
  const content = await readFile(join(directory, file), "utf8");
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (id && record.diagnostic_id !== id) continue;
      if (session && record.session_id !== session) continue;
      records.push(JSON.stringify(record));
    } catch {
      invalidLines += 1;
      invalidLineNumbers.push(`${file}:${index + 1}`);
    }
  }
}

const selected = records.slice(-tail);
const parsed = selected.map((line) => JSON.parse(line) as Record<string, unknown>);
const timeline = new Map<string, Record<string, unknown>[]>();
for (const record of parsed) {
  const key = `${String(record.diagnostic_id ?? "unknown")}/${String(record.session_id ?? "unknown")}/${String(record.round ?? 0)}`;
  const bucket = timeline.get(key) ?? [];
  bucket.push(record);
  timeline.set(key, bucket);
}
const timelineSummaries = [...timeline.entries()].map(([key, events]) => {
  const milestones = events
    .filter((event) => event.event === "milestone" || event.event === "state_transition")
    .map((event) => String(event.code ?? event.state_to ?? event.state ?? event.event));
  const errors = events.filter((event) => event.event === "error");
  const last = events.at(-1);
  const hasCommit = milestones.includes("commit_sent") || milestones.includes("input_committed");
  const listeningError = errors.some((event) => event.state === "listening" && !hasCommit);
  const phaseTimeout = errors.find((event) => event.code === "UPSTREAM_PHASE_TIMEOUT");
  const diagnosis = phaseTimeout
    ? "phase_timeout"
    : listeningError
      ? "provider_error_before_commit_or_unbounded_listening"
      : errors.length > 0
        ? "error_recorded_check_phase_and_provider_code"
        : "no_error_recorded";
  return {
    type: "diagnostics-timeline",
    key,
    first_ts: events[0]?.ts,
    last_ts: last?.ts,
    event_count: events.length,
    milestones,
    last_milestone: last?.last_milestone,
    last_state: last?.state,
    error_codes: errors.map((event) => event.code).filter((value): value is string => typeof value === "string"),
    provider_error_codes: events
      .map((event) => event.provider_error_code)
      .filter((value): value is string => typeof value === "string"),
    max_elapsed_ms: Math.max(0, ...events.map((event) => typeof event.elapsed_ms === "number" ? event.elapsed_ms : 0)),
    diagnosis,
  };
});
if (exportPath) {
  const target = resolve(exportPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, selected.length > 0 ? `${selected.join("\n")}\n` : "", "utf8");
}

console.log(JSON.stringify({
  type: "diagnostics-summary",
  directory,
  files: files.length,
  records: selected.length,
  invalid_lines: invalidLines,
  invalid_line_numbers: invalidLineNumbers,
  timelines: timelineSummaries.length,
  filter: id ? { diagnostic_id: id } : session ? { session_id: session } : null,
  export: exportPath ? resolve(exportPath) : null,
}));
for (const summary of timelineSummaries) console.log(JSON.stringify(summary));
for (const line of selected) console.log(line);
