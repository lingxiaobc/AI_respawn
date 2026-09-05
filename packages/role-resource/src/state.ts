import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const STAGES = ["preflight", "normalize", "locate", "mouth-half", "mouth-open", "eyes-half", "eyes-closed", "assemble", "audit", "export", "browser", "finalize"] as const;
export type Stage = typeof STAGES[number];
export interface Checkpoint { files: Record<string, string>; elapsedMs: number }
export interface RoleJob {
  id: string; version: 1; idempotencyKey: string; sourceHash: string; fileName: string;
  mode: "live" | "fixture"; status: "queued" | "running" | "paused" | "awaiting_review" | "approved" | "rejected";
  stage: Stage; completed: Partial<Record<Stage, Checkpoint>>;
  createdAt: string; updatedAt: string; error?: string; resource?: string; resourceHash?: string; pipelineVersion?: string;
  review?: { decision: "approved" | "rejected"; note: string; resourceHash: string; at: string };
}
export const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export async function atomicJson(path: string, data: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx");
  try { await file.writeFile(JSON.stringify(data, null, 2)); await file.sync(); } finally { await file.close(); }
  // Windows readers/AV can briefly deny replacement despite a valid writer lock.
  // Retry ONLY the local atomic rename, never the preceding paid operation.
  for (let attempt = 0; ; attempt++) {
    try { await rename(temporary, path); break; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(code ?? "") || attempt >= 5) throw error;
      await delay(20 * (attempt + 1));
    }
  }
}
export class RoleStore {
  readonly root: string;
  #lock = false;
  constructor(root: string) { this.root = resolve(root); }
  async initialize() {
    await mkdir(this.root, { recursive: true });
    // One writer for both CLI and HTTP. A crashed writer requires explicit reconciliation.
    const lock = await open(join(this.root, ".worker.lock"), "wx").catch(() => { throw new Error("ROLE_WORKER_LOCKED: worker active or interrupted; reconcile before removing lock"); });
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    await lock.sync(); await lock.close(); this.#lock = true;
    for (const job of await this.list()) if (job.status === "running") {
      job.status = "paused"; job.error = "PROCESS_INTERRUPTED: verify saved outputs and paid-call ledger before resume"; await this.save(job);
    }
  }
  directory(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("INVALID_ROLE_ID");
    return join(this.root, id);
  }
  async list(): Promise<RoleJob[]> {
    const jobs: RoleJob[] = [];
    for (const name of await readdir(this.root)) if (/^[a-f0-9-]{36}$/.test(name)) jobs.push(await this.get(name));
    return jobs.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  async get(id: string): Promise<RoleJob> { return JSON.parse(await readFile(join(this.directory(id), "job.json"), "utf8")); }
  async save(job: RoleJob) {
    if (!this.#lock) throw new Error("STORE_NOT_LOCKED");
    job.updatedAt = new Date().toISOString(); await atomicJson(join(this.directory(job.id), "job.json"), job);
  }
  async create(fileName: string, bytes: Buffer, key: string, mode: RoleJob["mode"]): Promise<RoleJob> {
    if (!this.#lock) throw new Error("STORE_NOT_LOCKED");
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key)) throw new Error("INVALID_IDEMPOTENCY_KEY");
    const sourceHash = hash(bytes);
    const existing = (await this.list()).find(j => j.idempotencyKey === key);
    if (existing) {
      if (existing.sourceHash !== sourceHash || existing.mode !== mode) throw new Error("IDEMPOTENCY_CONFLICT");
      return existing;
    }
    const now = new Date().toISOString();
    const job: RoleJob = { id: randomUUID(), version: 1, sourceHash, idempotencyKey: key, fileName, mode, status: "queued", stage: "preflight", completed: {}, createdAt: now, updatedAt: now };
    const staged = join(this.root, `.new-${job.id}`);
    await mkdir(staged);
    const source = await open(join(staged, "source.upload"), "wx");
    try { await source.writeFile(bytes); await source.sync(); } finally { await source.close(); }
    await atomicJson(join(staged, "job.json"), job);
    // Publish a complete job directory so list/worker never sees a half-created role.
    await rename(staged, this.directory(job.id)); return job;
  }
  async close() { if (this.#lock) { await unlink(join(this.root, ".worker.lock")); this.#lock = false; } }
}
