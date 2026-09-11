import { createHash, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AvatarRecord } from "./avatar-store.ts";

export type User = { id: string; username: string; user_type: "ADMIN" | "USER"; status: "enabled" | "disabled"; created_at: number; updated_at: number };
type UserRow = User & { password_hash: string; auth_version: number };
export type Identity = { user: User; sessionId: string; authVersion: number; expiresAt: number };
export type Assignment = { user_id: string; avatar_id: string; name: string; relationship: string; persona: string; revision: number; active: number };
export class AuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const safeUser = ({ id, username, user_type, status, created_at, updated_at }: UserRow): User => ({ id, username, user_type, status, created_at, updated_at });
export function passwordPolicy(password: unknown, initial = false): asserts password is string {
  if (typeof password !== "string" || password.length < (initial ? 10 : 12) || password.length > 128)
    throw new AuthError(400, initial ? "初始密码需为 10—128 位" : "密码需为 12—128 位");
}
export function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join("");
}
// scrypt is available in the supported Node runtime without a native dependency.
// Bound concurrent memory-hard operations so failed logins cannot exhaust memory.
let hashing = 0;
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (hashing >= 2) throw new AuthError(429, "请求较多，请稍后重试");
  hashing++;
  try {
    return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
  } finally { hashing--; }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16), key = await derive(password, salt);
  return `scrypt:131072:8:1:${salt.toString("hex")}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded?: string) {
  const parts = encoded?.split(":");
  const valid = parts?.length === 6 && parts.slice(0, 4).join(":") === "scrypt:131072:8:1"
    && /^[a-f0-9]{32}$/.test(parts[4]!) && /^[a-f0-9]{128}$/.test(parts[5]!);
  const key = await derive(password, valid ? Buffer.from(parts![4]!, "hex") : Buffer.alloc(16));
  return !!valid && timingSafeEqual(key, Buffer.from(parts![5]!, "hex"));
}
export function usernameValue(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/.test(value))
    throw new AuthError(400, "账号需为 3—32 位字母、数字、点、下划线或短横线");
  return value.toLowerCase();
}

export class AuthStore {
  readonly db: DatabaseSync;
  readonly now: () => number;
  constructor(db: DatabaseSync, now: () => number = Date.now) {
    this.db = db; this.now = now;
    db.exec(`CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      user_type TEXT NOT NULL CHECK(user_type IN ('ADMIN','USER')),
      password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','disabled')),
      auth_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS sole_admin ON users(user_type) WHERE user_type='ADMIN';
      CREATE TABLE IF NOT EXISTS auth_sessions(
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE,
        auth_version INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER);
      CREATE INDEX IF NOT EXISTS auth_session_user ON auth_sessions(user_id);
      CREATE TABLE IF NOT EXISTS user_avatars(
        user_id TEXT NOT NULL REFERENCES users(id), avatar_id TEXT NOT NULL REFERENCES avatars(id),
        name TEXT NOT NULL, relationship TEXT NOT NULL DEFAULT '', persona TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY(user_id,avatar_id));
      CREATE TABLE IF NOT EXISTS account_audit(
        id INTEGER PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target_id TEXT, created_at INTEGER NOT NULL);
      INSERT OR IGNORE INTO schema_migrations VALUES(3);`);
    const columns = db.prepare("PRAGMA table_info(calls)").all() as { name: string }[];
    for (const name of ["user_id", "auth_session_id", "purpose", "profile_revision"])
      if (!columns.some(c => c.name === name)) db.exec(`ALTER TABLE calls ADD COLUMN ${name} TEXT`);
    this.prune();
  }
  prune() {
    const now = this.now();
    this.db.prepare("DELETE FROM auth_sessions WHERE expires_at<=? OR revoked_at IS NOT NULL").run(now);
    this.db.prepare("DELETE FROM account_audit WHERE created_at<?").run(now - 30 * 86400_000);
  }
  audit(actor: string | null, action: string, target: string | null) {
    this.db.prepare("INSERT INTO account_audit(actor_id,action,target_id,created_at) VALUES(?,?,?,?)").run(actor, action, target, this.now());
  }
  row(id: string) { return this.db.prepare("SELECT * FROM users WHERE id=?").get(id) as UserRow | undefined; }
  user(id: string) { const row = this.row(id); return row ? safeUser(row) : undefined; }
  listUsers() { return (this.db.prepare("SELECT * FROM users ORDER BY created_at,id").all() as UserRow[]).map(safeUser); }
  admin() { return this.db.prepare("SELECT * FROM users WHERE user_type='ADMIN'").get() as UserRow | undefined; }
  async initialize(password?: string, allowLocalTestPassword = false) {
    if (this.admin()) return;
    if (!password) throw new Error("Administrator is not initialized. Run npm run account:init or set ADMIN_INITIAL_PASSWORD in the service environment.");
    passwordPolicy(password, allowLocalTestPassword);
    const hash = await hashPassword(password);
    if (this.admin()) return;
    const id = randomUUID(), now = this.now();
    this.db.prepare("INSERT INTO users(id,username,user_type,password_hash,created_at,updated_at) VALUES(?,?,'ADMIN',?,?,?)")
      .run(id, "lenox", hash, now, now);
    this.audit(null, "admin.initialized", id);
  }
  async createUser(actor: string, username: unknown, password: unknown, authorize: () => void = () => {}) {
    const normalized = usernameValue(username); passwordPolicy(password);
    if (this.db.prepare("SELECT id FROM users WHERE username=?").get(normalized)) throw new AuthError(409, "账号已存在");
    const hash = await hashPassword(password), now = this.now(), id = randomUUID();
    authorize();
    if (this.db.prepare("SELECT id FROM users WHERE username=?").get(normalized)) throw new AuthError(409, "账号已存在");
    this.db.prepare("INSERT INTO users(id,username,user_type,password_hash,created_at,updated_at) VALUES(?,?,'USER',?,?,?)")
      .run(id, normalized, hash, now, now);
    this.audit(actor, "user.created", id); return this.user(id)!;
  }
  async login(username: unknown, password: unknown, adminSeconds: number, userSeconds: number) {
    if (typeof username !== "string" || typeof password !== "string" || username.length > 128 || password.length > 128)
      throw new AuthError(401, "账号或密码不正确");
    const row = this.db.prepare("SELECT * FROM users WHERE username=?").get(username.toLowerCase()) as UserRow | undefined;
    const ok = await verifyPassword(password, row?.password_hash);
    const current = row && this.row(row.id);
    if (!ok || !current || current.status !== "enabled" || current.auth_version !== row!.auth_version || current.password_hash !== row!.password_hash)
      throw new AuthError(401, "账号或密码不正确，或账号已停用");
    this.prune();
    const token = randomBytes(32).toString("hex"), id = randomUUID();
    const maxAge = row!.user_type === "ADMIN" ? adminSeconds : userSeconds;
    const expires = this.now() + maxAge * 1000;
    this.db.prepare("INSERT INTO auth_sessions(id,user_id,token_hash,auth_version,expires_at) VALUES(?,?,?,?,?)")
      .run(id, row!.id, digest(token), row!.auth_version, expires);
    return { token, maxAge, user: safeUser(current) };
  }
  identity(token?: string): Identity | undefined {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
    const session = this.db.prepare("SELECT id,user_id,auth_version,expires_at FROM auth_sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?")
      .get(digest(token), this.now()) as { id: string; user_id: string; auth_version: number; expires_at: number } | undefined;
    const user = session && this.row(session.user_id);
    if (!session || !user || user.status !== "enabled" || user.auth_version !== session.auth_version) return;
    return { user: safeUser(user), sessionId: session.id, authVersion: user.auth_version, expiresAt: session.expires_at };
  }
  valid(identity: Identity) {
    const row = this.row(identity.user.id);
    return !!row && row.status === "enabled" && row.auth_version === identity.authVersion && identity.expiresAt > this.now()
      && !!this.db.prepare("SELECT id FROM auth_sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?")
        .get(identity.sessionId, row.id, this.now());
  }
  logout(identity: Identity) {
    this.db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE id=?").run(this.now(), identity.sessionId);
  }
  revokeUser(id: string) {
    this.db.prepare("UPDATE users SET auth_version=auth_version+1,updated_at=? WHERE id=?").run(this.now(), id);
    this.db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=?").run(this.now(), id);
  }
  async resetPassword(actor: string | null, id: string, password: unknown, initial = false, authorize: () => void = () => {}) {
    passwordPolicy(password, initial);
    if (!this.row(id)) throw new AuthError(404, "账号不存在");
    const hash = await hashPassword(password);
    authorize();
    this.db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash, id);
    this.revokeUser(id); this.audit(actor, "password.reset", id);
  }
  setStatus(actor: string, id: string, status: unknown) {
    const user = this.user(id);
    if (!user) throw new AuthError(404, "账号不存在");
    if (user.user_type === "ADMIN") throw new AuthError(403, "不能停用唯一管理员");
    if (status !== "enabled" && status !== "disabled") throw new AuthError(400, "账号状态无效");
    this.db.prepare("UPDATE users SET status=?,updated_at=? WHERE id=?").run(status, this.now(), id);
    this.revokeUser(id); this.audit(actor, `user.${status}`, id);
  }
  assignments(userId: string) {
    return this.db.prepare("SELECT * FROM user_avatars WHERE user_id=? AND active=1 ORDER BY rowid").all(userId) as Assignment[];
  }
  assignment(userId: string, avatarId: string) {
    return this.db.prepare("SELECT * FROM user_avatars WHERE user_id=? AND avatar_id=? AND active=1").get(userId, avatarId) as Assignment | undefined;
  }
  assign(actor: string, userId: string, avatar: AvatarRecord) {
    if (this.user(userId)?.user_type !== "USER") throw new AuthError(400, "请选择普通用户");
    // Regrant preserves that user's own settings; reassign never overwrites a profile.
    this.db.prepare(`INSERT INTO user_avatars(user_id,avatar_id,name,persona) VALUES(?,?,?,?)
      ON CONFLICT(user_id,avatar_id) DO UPDATE SET active=1`).run(userId, avatar.id, avatar.name, avatar.persona ?? "");
    this.audit(actor, "avatar.assigned", `${userId}/${avatar.id}`);
  }
  unassign(actor: string, userId: string, avatarId: string) {
    this.db.prepare("UPDATE user_avatars SET active=0,revision=revision+1 WHERE user_id=? AND avatar_id=?").run(userId, avatarId);
    this.audit(actor, "avatar.unassigned", `${userId}/${avatarId}`);
  }
  profile(actor: string, userId: string, avatarId: string, data: Record<string, unknown>) {
    if (!this.assignment(userId, avatarId)) throw new AuthError(404, "未分配该人物");
    if (Object.keys(data).some(k => !["name", "relationship", "persona"].includes(k))) throw new AuthError(400, "设定字段无效");
    for (const [name, max] of [["name", 100], ["relationship", 200], ["persona", 2000]] as const)
      if (typeof data[name] !== "string" || (data[name] as string).length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(data[name] as string))
        throw new AuthError(400, "人物名最多100字，关系称呼200字，提示词与设定2000字");
    if (!(data.name as string).trim()) throw new AuthError(400, "请填写人物名称");
    this.db.prepare("UPDATE user_avatars SET name=?,relationship=?,persona=?,revision=revision+1 WHERE user_id=? AND avatar_id=?")
      .run((data.name as string).trim(), (data.relationship as string).trim(), (data.persona as string).trim(), userId, avatarId);
    this.audit(actor, "avatar.profile.updated", `${userId}/${avatarId}`);
  }
  role(identity: Identity, avatar: AvatarRecord | null): AvatarRecord | null {
    if (!this.valid(identity) || !avatar || avatar.DELET_OR_NOT) return null;
    if (identity.user.user_type === "ADMIN") return { ...avatar };
    const profile = this.assignment(identity.user.id, avatar.id);
    return profile ? { ...avatar, name: profile.name,
      persona: [profile.relationship ? `关系与称呼：${profile.relationship}` : "", profile.persona].filter(Boolean).join("\n") } : null;
  }
}
