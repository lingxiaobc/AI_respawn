import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { providerUsage } from "../../../packages/provider-doubao/src/usage.ts";
import type { ServerEvent } from "../../../packages/provider-doubao/src/protocol.ts";

export type AvatarStatus = "queued" | "processing" | "paused" | "ready" | "failed" | "interrupted";
export type Normalization = { state:"pending"|"requesting"|"received"|"ready"|"failed"; slot:"primary"|"fallback";
  candidatePath?:string; model?:string; error?:string; elapsedMs?:number; usage?:Record<string,number> };
export type AvatarRecord = {
  id: string; batchId: string; name: string; status: AvatarStatus; stage: string;
  percent: number; createdAt: string; message?: string; frameUrl?: string;
  sourcePath: string; assetPath?: string; attempt: number;
  persona?: string; DELET_OR_NOT?: boolean; deletedAt?: string;
  normalizedPath?: string; normalization?: Normalization;
};
export const AVATAR_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** SQLite owns state; image and renderer bytes stay in private, versioned directories. */
export class AvatarStore {
  readonly db: DatabaseSync;
  readonly root: string;
  constructor(root: string) {
    this.root = root;
    mkdirSync(root, { recursive: true });
    this.db = new DatabaseSync(resolve(root, "avatars.sqlite"));
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS uncommitted_uploads(id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS avatars(
        id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id),
        name TEXT NOT NULL, status TEXT NOT NULL, record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts(
        id TEXT PRIMARY KEY, avatar_id TEXT NOT NULL REFERENCES avatars(id),
        started_at TEXT NOT NULL, ended_at TEXT, outcome TEXT);
      CREATE TABLE IF NOT EXISTS calls(
        id TEXT PRIMARY KEY, avatar_id TEXT, created_at TEXT NOT NULL,
        started_at TEXT, ended_at TEXT, reason TEXT, input_bytes INTEGER DEFAULT 0,
        output_bytes INTEGER DEFAULT 0, usage_json TEXT);
      INSERT OR IGNORE INTO schema_migrations VALUES(1);
    `);
    const columns=this.db.prepare("PRAGMA table_info(avatars)").all() as {name:string}[];
    if(!columns.some(c=>c.name==="DELET_OR_NOT")) this.db.exec("ALTER TABLE avatars ADD COLUMN DELET_OR_NOT INTEGER NOT NULL DEFAULT 0 CHECK(DELET_OR_NOT IN (0,1))");
    this.db.exec("INSERT OR IGNORE INTO schema_migrations VALUES(2)");
    // Process restarts never silently replay unfinished work.
    for (const avatar of this.list()) {
      if (["queued", "processing", "paused"].includes(avatar.status))
        this.save({ ...avatar, status: "interrupted", stage: "interrupted", message: "处理已中断，请点击重试" });
    }
    this.db.prepare("UPDATE attempts SET ended_at=?,outcome='interrupted' WHERE ended_at IS NULL").run(new Date().toISOString());
    this.db.prepare("UPDATE calls SET ended_at=?,reason='SERVICE_INTERRUPTED' WHERE ended_at IS NULL").run(new Date().toISOString());
    this.prune();
  }
  transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = action(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  list(includeArchived = false): AvatarRecord[] {
    return (this.db.prepare(`SELECT record FROM avatars ${includeArchived ? "" : "WHERE DELET_OR_NOT=0"} ORDER BY rowid`).all() as { record: string }[])
      .map(row => JSON.parse(row.record) as AvatarRecord);
  }
  get(id: string): AvatarRecord | null {
    const row = this.db.prepare("SELECT record FROM avatars WHERE id=?").get(id) as { record: string } | undefined;
    return row ? JSON.parse(row.record) as AvatarRecord : null;
  }
  batchByKey(key: string): string | undefined {
    return (this.db.prepare("SELECT id FROM batches WHERE request_key=?").get(key) as { id: string } | undefined)?.id;
  }
  addBatch(id: string, key: string) {
    this.db.prepare("INSERT INTO batches VALUES(?,?,?)").run(id, key, new Date().toISOString());
  }
  save(record: AvatarRecord) {
    // A stale worker must never undo a user archive, even if it still holds an old record.
    const previous=this.get(record.id);
    if(previous?.DELET_OR_NOT)record={...record,DELET_OR_NOT:true,deletedAt:previous.deletedAt};
    this.db.prepare("INSERT INTO avatars(id,batch_id,name,status,record,DELET_OR_NOT) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,record=excluded.record,DELET_OR_NOT=excluded.DELET_OR_NOT")
      .run(record.id, record.batchId, record.name, record.status, JSON.stringify(record),record.DELET_OR_NOT?1:0);
  }
  patch(id: string, changes: Partial<AvatarRecord>) {
    const current=this.get(id);if(!current)throw new Error("人物不存在");
    this.save({...current,...changes,id:current.id,batchId:current.batchId});
    return this.get(id)!;
  }
  active(id: string) { const record=this.get(id);return record&&!record.DELET_OR_NOT?record:null; }
  async importLegacy() {
    for (const id of await readdir(this.root)) {
      if (!AVATAR_ID.test(id) || this.get(id)) continue;
      if (this.db.prepare("SELECT id FROM uncommitted_uploads WHERE id=?").get(id)) continue;
      const directory = resolve(this.root, id);
      let old: {id?: string; status?: string; createdAt?: string} = {};
      let damaged = false;
      try {
        old = JSON.parse(await readFile(resolve(directory, "job.json"), "utf8"));
        if (!old || old.id !== id) { old = {}; damaged = true; }
      } catch { damaged = true; }
      let ready = !damaged && old.status === "ready";
      if (ready) for (const name of ["frame.html", "profile.json", "source.jpg", "assets/01.mp4", "assets/combined_data.json.gz"]) {
        if (!(await stat(resolve(directory, name)).catch(() => null))?.size) { ready = false; damaged = true; }
      }
      // Keep corrupt/missing legacy resources visible. Database errors must propagate;
      // they must never look like a successful migration that silently lost a role.
      this.transaction(() => {
          this.addBatch(id, "legacy:" + id);
          this.save({ id, batchId: id, name: "已保存人物 " + id.slice(0, 6),
            status: ready ? "ready" : old.status === "failed" ? "failed" : "interrupted",
            stage: ready ? "ready" : "interrupted", percent: ready ? 100 : 0,
            createdAt: old.createdAt ?? new Date().toISOString(),
            sourcePath: resolve(directory, "upload.bin"), assetPath: ready ? directory : undefined,
            frameUrl: ready ? `/api/avatars/${id}/frame.html` : undefined, attempt: 0,
            message: ready ? undefined : damaged ? "历史记录或资源不完整，请重试或重新上传" : "历史任务未完成，请重试或重新上传" });
        });
    }
  }
  startAttempt(id: string, avatarId: string) {
    this.db.prepare("INSERT INTO attempts(id,avatar_id,started_at) VALUES(?,?,?)").run(id, avatarId, new Date().toISOString());
  }
  finishAttempt(id: string, outcome: string) {
    this.db.prepare("UPDATE attempts SET ended_at=?,outcome=? WHERE id=?").run(new Date().toISOString(), outcome, id);
  }
  startCall(id: string, avatarId?: string) {
    this.prune();
    this.db.prepare("INSERT INTO calls(id,avatar_id,created_at) VALUES(?,?,?)").run(id, avatarId ?? null, new Date().toISOString());
  }
  connectedCall(id: string) { this.db.prepare("UPDATE calls SET started_at=COALESCE(started_at,?) WHERE id=?").run(new Date().toISOString(), id); }
  recordUsage(id: string, event: ServerEvent) {
    const usage=providerUsage(event); if(!usage)return;
    const row=this.db.prepare("SELECT usage_json FROM calls WHERE id=?").get(id) as {usage_json:string|null}|undefined;
    if(!row)return;
    const entries:NonNullable<ReturnType<typeof providerUsage>>[]=row.usage_json?JSON.parse(row.usage_json):[];
    const index=entries.findIndex(item=>item.key===usage.key);
    if(index>=0)entries[index]=usage;else entries.push(usage);
    this.db.prepare("UPDATE calls SET usage_json=? WHERE id=?").run(JSON.stringify(entries),id);
  }
  endCall(id: string, reason: string, input = 0, output = 0) {
    this.db.prepare("UPDATE calls SET ended_at=?,reason=?,input_bytes=?,output_bytes=? WHERE id=? AND ended_at IS NULL")
      .run(new Date().toISOString(), reason, input, output, id);
  }
  prune() {
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
    this.db.prepare("DELETE FROM calls WHERE ended_at IS NOT NULL AND ended_at < ?").run(cutoff);
    this.db.prepare("DELETE FROM attempts WHERE ended_at IS NOT NULL AND ended_at < ? AND outcome != 'cleanup_failed'").run(cutoff);
  }
  close() { this.db.close(); }
}
