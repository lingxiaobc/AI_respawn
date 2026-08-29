import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { createDiagnosticRecord, type DiagnosticRecordInput } from "./schema.ts";

export interface DiagnosticLoggerOptions {
  directory?: string;
  retentionDays?: number;
  now?: () => Date;
  onWriteFailure?: (error: Error) => void;
}

export class DiagnosticLogger {
  readonly #directory: string;
  readonly #retentionDays: number;
  readonly #now: () => Date;
  readonly #onWriteFailure: (error: Error) => void;
  #lastPrunedDate = "";
  #warnedWriteFailure = false;

  constructor(options: DiagnosticLoggerOptions = {}) {
    this.#directory = resolve(options.directory ?? "logs");
    this.#retentionDays = Math.max(1, Math.floor(options.retentionDays ?? 7));
    this.#now = options.now ?? (() => new Date());
    this.#onWriteFailure = options.onWriteFailure ?? ((error) => console.error(JSON.stringify({
      type: "diagnostic-log-write-failed",
      message: error.message,
    })));
  }

  get directory(): string {
    return this.#directory;
  }

  filePath(now = this.#now()): string {
    return join(this.#directory, `diagnostics-${now.toISOString().slice(0, 10)}.jsonl`);
  }

  write(input: DiagnosticRecordInput): void {
    try {
      const now = this.#now();
      mkdirSync(this.#directory, { recursive: true });
      this.#prune(now);
      const record = createDiagnosticRecord(input, now);
      appendFileSync(this.filePath(now), `${JSON.stringify(record)}\n`, { encoding: "utf8" });
    } catch (error) {
      if (!this.#warnedWriteFailure) {
        this.#warnedWriteFailure = true;
        this.#onWriteFailure(error instanceof Error ? error : new Error("unknown logger failure"));
      }
    }
  }

  #prune(now: Date): void {
    const date = now.toISOString().slice(0, 10);
    if (date === this.#lastPrunedDate) return;
    this.#lastPrunedDate = date;
    const cutoff = now.getTime() - this.#retentionDays * 86_400_000;
    let names: string[];
    try {
      names = readdirSync(this.#directory);
    } catch {
      return;
    }
    for (const name of names) {
      const match = /^diagnostics-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
      if (!match) continue;
      const fileDate = Date.parse(`${match[1]}T00:00:00.000Z`);
      if (Number.isFinite(fileDate) && fileDate < cutoff) {
        try {
          unlinkSync(join(this.#directory, name));
        } catch {
          // Retention is best-effort and must never block the main session.
        }
      }
    }
  }
}
