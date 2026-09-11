import type { IncomingMessage, ServerResponse } from "node:http";
import { AuthError, AuthStore, generatePassword, verifyPassword, type Identity } from "./auth-store.ts";
import type { AvatarStore } from "./avatar-store.ts";

export const COOKIE = "respawn_session";
export function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(data));
}
function token(request: IncomingMessage) {
  return request.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}
export function sameOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  const allowed = new Set(["http://127.0.0.1:5173", "http://localhost:5173",
    `http://127.0.0.1:${request.socket.localPort}`, `http://localhost:${request.socket.localPort}`]);
  return typeof origin === "string" && allowed.has(origin) && request.headers["sec-fetch-site"] !== "cross-site";
}
export function requireMutation(request: IncomingMessage) {
  if (!sameOrigin(request) || request.headers["x-account-request"] !== "1") throw new AuthError(403, "请从登录后的页面操作");
}
async function body(request: IncomingMessage) {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json") throw new AuthError(415, "请提交 JSON 数据");
  const chunks: Buffer[] = []; let size = 0;
  const timeout = setTimeout(() => request.destroy(), 15_000);
  try {
    for await (const part of request) {
      const chunk = Buffer.from(part); size += chunk.length;
      if (size > 16_384) throw new AuthError(413, "提交内容过大");
      chunks.push(chunk);
    }
    let data: unknown;
    try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AuthError(400, "提交格式无效"); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new AuthError(400, "提交格式无效");
    return data as Record<string, unknown>;
  } finally { clearTimeout(timeout); }
}
function seconds(value: string | undefined, fallback: number) {
  const result = Number(value ?? fallback);
  if (!Number.isSafeInteger(result) || result < 1 || result > 30 * 86400) throw new Error("Invalid authentication session lifetime");
  return result;
}
type LiveCall = { identity: Identity; avatarId: string; close: () => Promise<void> };
export class AuthService {
  readonly store: AuthStore;
  readonly avatars: AvatarStore;
  readonly live = new Set<LiveCall>();
  readonly adminSeconds: number;
  readonly userSeconds: number;
  readonly secure: boolean;
  readonly attempts = new Map<string, { count: number; until: number }>();
  constructor(avatars: AvatarStore) {
    this.avatars = avatars; this.store = new AuthStore(avatars.db);
    this.adminSeconds = seconds(process.env.AUTH_ADMIN_SECONDS, 8 * 3600);
    this.userSeconds = seconds(process.env.AUTH_USER_SECONDS, 7 * 86400);
    this.secure = process.env.AUTH_SECURE_COOKIE === "1";
  }
  identity(request: IncomingMessage) { return this.store.identity(token(request)); }
  require(request: IncomingMessage) {
    const identity = this.identity(request);
    if (!identity) throw new AuthError(401, "登录已失效，请重新登录");
    return identity;
  }
  cookie(value: string, age: number) {
    return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${this.secure ? "; Secure" : ""}`;
  }
  register(call: LiveCall) { this.live.add(call); return () => this.live.delete(call); }
  canCall(identity: Identity, avatarId: string) { return !!this.store.role(identity, this.avatars.active(avatarId)); }
  async sweep() {
    const results = await Promise.allSettled([...this.live].filter(c => !this.canCall(c.identity, c.avatarId)).map(c => c.close()));
    if (results.some(r => r.status === "rejected")) throw new AuthError(503, "访问已撤销，通话资源清理待处理");
  }
  throttle(key: string, limit: number) {
    const now = Date.now();
    for (const [k, entry] of this.attempts) if (entry.until <= now) this.attempts.delete(k);
    // Bounded keys even with random usernames.
    if (!this.attempts.has(key) && this.attempts.size >= 2000) throw new AuthError(429, "请求较多，请稍后重试");
    const entry = this.attempts.get(key) ?? { count: 0, until: now + 60_000 };
    entry.count++; this.attempts.set(key, entry);
    if (entry.count > limit) throw new AuthError(429, "尝试过于频繁，请一分钟后重试");
  }
  async handle(request: IncomingMessage, response: ServerResponse) {
    try {
      const path = new URL(request.url!, "http://localhost").pathname, method = request.method;
      if (method !== "GET" && method !== "HEAD") requireMutation(request);
      if (path === "/api/auth/login" && method === "POST") {
        this.throttle(`ip:${request.socket.remoteAddress}`, 30);
        const data = await body(request);
        this.throttle(`user:${String(data.username).slice(0, 128).toLowerCase()}`, 10);
        const result = await this.store.login(data.username, data.password, this.adminSeconds, this.userSeconds);
        response.setHeader("set-cookie", this.cookie(result.token, result.maxAge));
        json(response, 200, { user: result.user }); return;
      }
      if (path === "/api/auth/logout" && method === "POST" && !this.identity(request)) {
        response.setHeader("set-cookie", this.cookie("", 0)); json(response, 200, { ok: true }); return;
      }
      const identity = this.require(request);
      if (path === "/api/me" && method === "GET") { json(response, 200, { user: identity.user }); return; }
      if (path === "/api/auth/logout" && method === "POST") {
        this.store.logout(identity); response.setHeader("set-cookie", this.cookie("", 0));
        await this.sweep(); json(response, 200, { ok: true }); return;
      }
      if (identity.user.user_type !== "ADMIN") throw new AuthError(403, "仅管理员可以执行此操作");
      if (method !== "GET") this.throttle(`admin:${identity.user.id}`, 60);
      if (path === "/api/admin/password" && method === "POST") { json(response, 200, { password: generatePassword() }); return; }
      if (path === "/api/admin/self/password" && method === "POST") {
        const data = await body(request);
        if (typeof data.currentPassword !== "string" || data.currentPassword.length > 128 ||
          !await verifyPassword(data.currentPassword, this.store.row(identity.user.id)?.password_hash))
          throw new AuthError(400, "当前密码不正确");
        if (!this.store.valid(identity)) throw new AuthError(401, "登录已失效");
        await this.store.resetPassword(identity.user.id, identity.user.id, data.password, false, () => this.ensureAdmin(identity));
        response.setHeader("set-cookie", this.cookie("", 0)); await this.sweep();
        json(response, 200, { ok: true }); return;
      }
      if (path === "/api/admin/users" && method === "GET") { json(response, 200, { users: this.store.listUsers() }); return; }
      if (path === "/api/admin/users" && method === "POST") {
        const data = await body(request); this.ensureAdmin(identity);
        const password = data.password === undefined ? generatePassword() : data.password;
        const user = await this.store.createUser(identity.user.id, data.username, password, () => this.ensureAdmin(identity));
        json(response, 201, { user, password }); return;
      }
      const match = /^\/api\/admin\/users\/([^/]+)\/(password-reset|status|avatars)(?:\/([^/]+))?$/.exec(path);
      if (!match) throw new AuthError(404, "接口不存在");
      const [, userId, action, avatarId] = match;
      const user = this.store.user(userId!);
      if (!user || user.user_type !== "USER") throw new AuthError(404, "用户不存在");
      if (action === "password-reset" && method === "POST" && !avatarId) {
        const data = await body(request); this.ensureAdmin(identity);
        const password = data.password === undefined ? generatePassword() : data.password;
        await this.store.resetPassword(identity.user.id, userId!, password, false, () => this.ensureAdmin(identity));
        await this.sweep(); json(response, 200, { password }); return;
      }
      if (action === "status" && method === "PATCH" && !avatarId) {
        const data = await body(request); this.ensureAdmin(identity);
        this.store.setStatus(identity.user.id, userId!, data.status); await this.sweep();
        json(response, 200, { user: this.store.user(userId!) }); return;
      }
      if (action === "avatars" && method === "GET" && !avatarId) {
        json(response, 200, { assignments: this.store.assignments(userId!).filter(p => this.avatars.active(p.avatar_id)) }); return;
      }
      if (action === "avatars" && method === "POST" && !avatarId) {
        const data = await body(request); this.ensureAdmin(identity);
        if (!Array.isArray(data.avatarIds) || data.avatarIds.length > 500 || data.avatarIds.some(id => typeof id !== "string"))
          throw new AuthError(400, "请选择要分配的人物（单次最多500个）");
        const avatars = [...new Set(data.avatarIds as string[])].map(id => this.avatars.active(id));
        if (avatars.some(a => !a)) throw new AuthError(400, "所选人物已不存在");
        this.avatars.transaction(() => { for (const avatar of avatars) this.store.assign(identity.user.id, userId!, avatar!); });
        json(response, 200, { ok: true }); return;
      }
      if (action === "avatars" && avatarId && method === "DELETE") {
        this.store.unassign(identity.user.id, userId!, avatarId); await this.sweep();
        json(response, 200, { ok: true }); return;
      }
      if (action === "avatars" && avatarId && method === "PATCH") {
        const data = await body(request); this.ensureAdmin(identity);
        if (!this.avatars.active(avatarId)) throw new AuthError(404, "人物不存在");
        this.store.profile(identity.user.id, userId!, avatarId, data);
        json(response, 200, { assignment: this.store.assignment(userId!, avatarId) }); return;
      }
      throw new AuthError(404, "接口不存在");
    } catch (error) {
      if (!response.headersSent) json(response, error instanceof AuthError ? error.status : 500,
        { message: error instanceof AuthError ? error.message : "账户服务异常，请稍后重试" });
    }
  }
  ensureAdmin(identity: Identity) {
    if (!this.store.valid(identity) || identity.user.user_type !== "ADMIN") throw new AuthError(401, "管理员登录已失效");
  }
}
