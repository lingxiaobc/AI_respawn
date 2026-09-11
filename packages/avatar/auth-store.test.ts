import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AvatarStore } from "../../apps/server/src/avatar-store.ts";
import { AuthStore, generatePassword, passwordPolicy } from "../../apps/server/src/auth-store.ts";

test("accounts persist, passwords are hashed, independent profiles survive regrant and default edits", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "auth-store-"));
  let avatars = new AvatarStore(root), clock = Date.now();
  try {
    let auth = new AuthStore(avatars.db, () => clock);
    const initial = "Initial-test-pass", changed = "Changed-test-pass";
    await auth.initialize(initial);
    const admin = auth.admin()!;
    await auth.initialize("Must-not-overwrite");
    const logged = await auth.login("LENOX", initial, 3600, 7200);
    const adminIdentity = auth.identity(logged.token)!;
    assert.equal(logged.user.username, "lenox");
    assert.equal(generatePassword().length, 12);
    assert.throws(() => passwordPolicy("short"));
    assert.ok(admin.password_hash.startsWith("scrypt:131072:8:1:"));
    assert.ok(!JSON.stringify(auth.listUsers()).includes("password_hash"));
    const a = await auth.createUser(admin.id, "user-a", "User-A-test-pass");
    const b = await auth.createUser(admin.id, "user-b", "User-B-test-pass");
    await assert.rejects(auth.createUser(admin.id, "USER-A", "User-A-test-pass"));
    const batch = randomUUID(); avatars.addBatch(batch, batch);
    for (const name of ["shared", "second"]) {
      const id = randomUUID();
      avatars.save({ id, batchId: batch, name, persona: "默认设定", status: "ready", stage: "ready", percent: 100,
        createdAt: new Date().toISOString(), sourcePath: "private", attempt: 0 });
    }
    const [shared, second] = avatars.list();
    auth.assign(admin.id, a.id, shared!); auth.assign(admin.id, a.id, second!); auth.assign(admin.id, b.id, shared!);
    auth.profile(admin.id, a.id, shared!.id, { name: "A的老师", relationship: "师生", persona: "A专属提示词" });
    auth.profile(admin.id, b.id, shared!.id, { name: "B的同学", relationship: "同学", persona: "B专属提示词" });
    avatars.patch(shared!.id, { name: "新默认名字", persona: "新默认设定" });
    auth.assign(admin.id, a.id, shared!);
    const aLogin = await auth.login(a.username, "User-A-test-pass", 3600, 7200);
    const aSecond = await auth.login(a.username, "User-A-test-pass", 3600, 7200);
    const bLogin = await auth.login(b.username, "User-B-test-pass", 3600, 7200);
    const ai = auth.identity(aLogin.token)!, bi = auth.identity(bLogin.token)!;
    assert.equal(auth.assignments(a.id).length, 2);
    assert.ok(auth.role(ai, shared!)?.persona?.includes("A专属"));
    assert.ok(!auth.role(ai, shared!)?.persona?.includes("B专属"));
    assert.equal(auth.role(bi, second!), null);
    auth.unassign(admin.id, a.id, shared!.id);
    assert.equal(auth.role(ai, shared!), null);
    assert.ok(auth.role(bi, shared!)); assert.ok(auth.role(ai, second!));
    auth.assign(admin.id, a.id, shared!);
    assert.equal(auth.assignment(a.id, shared!.id)?.name, "A的老师");
    await auth.resetPassword(admin.id, a.id, changed);
    assert.equal(auth.identity(aLogin.token), undefined); assert.equal(auth.identity(aSecond.token), undefined);
    assert.equal(auth.valid(ai), false); assert.ok(auth.valid(bi));
    await assert.rejects(auth.login(a.username, "User-A-test-pass", 3600, 7200));
    const newLogin = await auth.login(a.username, changed, 3600, 7200);
    auth.setStatus(admin.id, a.id, "disabled"); assert.equal(auth.identity(newLogin.token), undefined);
    auth.setStatus(admin.id, a.id, "enabled"); assert.equal(auth.identity(newLogin.token), undefined);
    assert.throws(() => auth.setStatus(admin.id, admin.id, "disabled"));
    auth.logout(bi); assert.equal(auth.identity(bLogin.token), undefined);
    assert.ok(auth.valid(adminIdentity)); clock += 3600_001; assert.equal(auth.valid(adminIdentity), false);
    avatars.close(); avatars = new AvatarStore(root); auth = new AuthStore(avatars.db);
    assert.equal(auth.listUsers().length, 3); assert.equal(avatars.list().length, 2);
    assert.equal(auth.assignment(a.id, shared!.id)?.persona, "A专属提示词");
    assert.ok(await auth.login(a.username, changed, 3600, 7200));
    const audit = JSON.stringify(avatars.db.prepare("SELECT * FROM account_audit").all());
    assert.ok(!audit.includes(changed)); assert.ok(!audit.includes("A专属提示词"));
  } finally { avatars.close(); await rm(root, { recursive: true, force: true }); }
});
