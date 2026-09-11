import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { WebSocket } from "ws";
import { accountFixture } from "./account-fixture.ts";
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(check: () => boolean) { for (let i = 0; i < 100; i++) { if (check()) return; await delay(30); } throw Error("Condition timed out"); }
const ready = (ws: WebSocket) => new Promise<void>((done, reject) => {
  ws.on("message", raw => { const e = JSON.parse(raw.toString()); if (e.type === "state" && e.state === "ready") done(); if (e.type === "error") reject(Error(e.code)); }); ws.once("error", reject);
});
test("gateway isolates HTTP/media/WS, snapshots profiles and revokes only affected calls", { timeout: 30_000 }, async t => {
  const f = await accountFixture(); t.after(f.close);
  const admin = await f.login("lenox", "Fixture-admin-pass");
  const create = async (username: string) => {
    const r = await f.api("/api/admin/users", "POST", { username, password: "Fixture-user-pass" }, admin); assert.equal(r.status, 201); return (await r.json()).user;
  };
  const a = await create("user-a"), b = await create("user-b");
  const ac = await f.login(a.username, "Fixture-user-pass"), ac2 = await f.login(a.username, "Fixture-user-pass"), bc = await f.login(b.username, "Fixture-user-pass");
  const [shared, second, hidden] = f.ids;
  assert.equal((await f.api("/api/avatars")).status, 401);
  assert.equal((await f.api("/api/avatars", "GET", undefined, "respawn_session=" + "a".repeat(64))).status, 401);
  for (const [id, ids] of [[a.id, [shared, second]], [b.id, [shared]]] as const)
    assert.equal((await f.api(`/api/admin/users/${id}/avatars`, "POST", { avatarIds: ids }, admin)).status, 200);
  for (const [id, name, persona] of [[a.id, "A人物", "A独立提示"], [b.id, "B人物", "B独立提示"]])
    assert.equal((await f.api(`/api/admin/users/${id}/avatars/${shared}`, "PATCH", { name, relationship: "朋友", persona }, admin)).status, 200);
  await f.api(`/api/avatars/${shared}`, "PATCH", { persona: "新的共享默认" }, admin);
  const listA = await (await f.api("/api/avatars", "GET", undefined, ac)).json();
  assert.equal(listA.avatars.length, 2); assert.equal(listA.avatars[0].name, "A人物");
  assert.ok(!JSON.stringify(listA).includes("persona")); assert.ok(!JSON.stringify(listA).includes("新默认"));
  assert.equal((await (await f.api("/api/avatars", "GET", undefined, bc)).json()).avatars.length, 1);
  for (const path of ["status", "source.jpg", "frame.html", "profile.json", "assets/01.mp4", "assets/combined_data.json.gz"])
    for (const method of ["GET", "HEAD"]) assert.equal((await f.api(`/api/avatars/${hidden}/${path}`, method, undefined, ac)).status, 404);
  assert.equal((await f.api(`/api/avatars/${shared}`, "PATCH", { name: "hacked" }, ac)).status, 403);
  assert.equal((await f.api(`/api/avatars/${shared}/source.jpg`, "HEAD", undefined, ac)).status, 200);
  const range = await f.api(`/api/avatars/${shared}/assets/01.mp4`, "GET", undefined, ac, { range: "bytes=0-3" });
  assert.equal(range.status, 206); assert.equal(await range.text(), "test"); assert.match(range.headers.get("cache-control")!, /no-store/);
  assert.equal((await f.api(`/api/avatars/${shared}/assets/01.mp4`, "GET", undefined, ac, { range: "bytes=900-" })).status, 416);
  async function rejected(id: string, cookie: string) {
    const ws = f.connect(id, cookie); const code = await new Promise<number>((resolve, reject) => { ws.on("unexpected-response", (_q, r) => { r.resume(); ws.terminate(); resolve(r.statusCode!); }); ws.on("error", () => {}); ws.on("open", () => reject(Error("Unexpected authorized connection"))); }); return code;
  }
  assert.equal(await rejected(shared!, ""), 401); assert.equal(await rejected(hidden!, ac), 403); assert.equal(f.upstreams.length, 0);
  const call = f.connect(shared!, ac); call.on("error", () => {}); await ready(call); assert.match(f.instructions[0]!, /A独立提示/); assert.doesNotMatch(f.instructions[0]!, /B独立提示|新的共享默认/);
  const busy = f.connect(shared!, bc); await assert.rejects(ready(busy)); assert.equal(f.upstreams.length, 1); assert.equal(call.readyState, WebSocket.OPEN);
  await f.api(`/api/admin/users/${b.id}/avatars/${shared}`, "DELETE", undefined, admin); assert.equal(call.readyState, WebSocket.OPEN);
  await f.api(`/api/admin/users/${a.id}/avatars/${second}`, "DELETE", undefined, admin); assert.equal(call.readyState, WebSocket.OPEN);
  const revoked = new Promise<void>(r => call.once("close", () => r()));
  assert.equal((await f.api(`/api/admin/users/${a.id}/password-reset`, "POST", { password: "Fixture-new-pass" }, admin)).status, 200); await revoked;
  assert.equal((await f.api("/api/me", "GET", undefined, ac)).status, 401); assert.equal((await f.api("/api/me", "GET", undefined, ac2)).status, 401);
  assert.equal((await f.api("/api/me", "GET", undefined, bc)).status, 200);
  const fresh = await f.login(a.username, "Fixture-new-pass");
  // Revoke while preparing: no waiting for the upstream session.created timeout.
  f.holdPreparation(true); const preparing = f.connect(shared!, fresh); preparing.on("error", () => {});
  await until(() => f.upstreams.length === 2);
  const ended = new Promise<void>(r => preparing.once("close", () => r()));
  assert.equal((await f.api(`/api/admin/users/${a.id}/avatars/${shared}`, "DELETE", undefined, admin)).status, 200); await ended;
  assert.equal(await rejected(shared!, fresh), 403);
  await f.api(`/api/admin/users/${a.id}/avatars`, "POST", { avatarIds: [shared] }, admin); f.holdPreparation(false);
  const last = f.connect(shared!, fresh); last.on("error", () => {}); await ready(last);
  const expires = new Promise<void>(r => last.once("close", () => r()));
  const db = new DatabaseSync(join(f.storage, "avatars.sqlite"));
  try { db.prepare("UPDATE auth_sessions SET expires_at=0 WHERE user_id=?").run(a.id); } finally { db.close(); }
  await expires; assert.equal((await f.api("/api/me", "GET", undefined, fresh)).status, 401);
  assert.equal((await (await f.api("/api/avatars", "GET", undefined, admin)).json()).callActive, false);
});
