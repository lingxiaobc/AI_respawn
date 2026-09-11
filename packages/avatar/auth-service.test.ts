import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { AvatarStore } from "../../apps/server/src/avatar-store.ts";
import { AuthService } from "../../apps/server/src/auth-service.ts";

test("HTTP authentication protects mutations, emits private cookies and revokes active identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "auth-http-")), avatars = new AvatarStore(root), auth = new AuthService(avatars);
  await auth.store.initialize("Initial-test-pass");
  const server = createServer((req, res) => void auth.handle(req, res));
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const api = (path: string, method = "GET", data?: unknown, cookie = "", extra = {}) => fetch(origin + path, {
    method, headers: { "content-type": "application/json", origin, "x-account-request": "1", cookie, ...extra },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  try {
    assert.equal((await api("/api/me")).status, 401);
    assert.equal((await api("/api/auth/login", "POST", { username: "lenox", password: "Initial-test-pass" }, "", { origin: "https://evil.example" })).status, 403);
    const login = await api("/api/auth/login", "POST", { username: "lenox", password: "Initial-test-pass" });
    const cookie = login.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Max-Age=28800/);
    const adminCookie = cookie.split(";")[0]!;
    const created = await api("/api/admin/users", "POST", { username: "test-user" }, adminCookie);
    assert.equal(created.status, 201);
    const result = await created.json(); assert.equal(result.password.length, 12);
    assert.equal(result.user.user_type, "USER"); assert.ok(!("password_hash" in result.user));
    const userLogin = await api("/api/auth/login", "POST", { username: "test-user", password: result.password });
    const userCookie = userLogin.headers.get("set-cookie")!.split(";")[0]!;
    assert.equal((await api("/api/admin/users", "GET", undefined, userCookie)).status, 403);
    assert.equal((await api("/api/admin/users", "POST", { username: "another", password: "a-test-password" }, adminCookie, { "x-account-request": "" })).status, 403);
    assert.equal((await api(`/api/admin/users/${result.user.id}/password-reset`, "POST", { password: "short" }, adminCookie)).status, 400);
    assert.equal((await api(`/api/admin/users/${result.user.id}/password-reset`, "POST", {}, adminCookie)).status, 200);
    assert.equal((await api("/api/me", "GET", undefined, userCookie)).status, 401);
    assert.equal((await api("/api/me", "GET", undefined, adminCookie)).status, 200);
    assert.equal((await api("/api/auth/logout", "POST", {}, adminCookie)).status, 200);
    assert.equal((await api("/api/auth/logout", "POST", {}, adminCookie)).status, 200);
    assert.equal((await api("/api/me", "GET", undefined, adminCookie)).status, 401);
    for (let i = 0; i < 10; i++) auth.throttle("test-limit", 10);
    assert.throws(() => auth.throttle("test-limit", 10), /频繁/);
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); avatars.close(); await rm(root, { recursive: true, force: true }); }
});
