import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoleStore } from "./src/state.ts";
import { PaidImages } from "./src/paid-images.ts";

test("role identity, idempotency, restart and single writer", async () => {
  const root = await mkdtemp(join(tmpdir(), "role-store-")); const store = new RoleStore(root);
  try {
    await store.initialize(); const other = new RoleStore(root); await assert.rejects(other.initialize(), /LOCKED/);
    const a = await store.create("a", Buffer.from("x"), "key-first", "fixture");
    assert.equal((await store.create("a", Buffer.from("x"), "key-first", "fixture")).id, a.id);
    await assert.rejects(store.create("a", Buffer.from("y"), "key-first", "fixture"), /CONFLICT/);
    assert.notEqual((await store.create("a", Buffer.from("x"), "key-second", "fixture")).id, a.id);
    a.status = "running"; await store.save(a); await store.close(); await other.initialize();
    assert.equal((await other.get(a.id)).status, "paused"); await other.close();
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});
test("shared paid ledger blocks disabled calls and unknown completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "role-paid-")); let calls = 0;
  const provider = { edit: async () => { calls++; throw new Error("connection interrupted"); } };
  const input = { sourceHash: "source", pngBytes: Buffer.from([1]), width: 1024, height: 1536, fileName: "a", mimeType: "image/png" as const };
  try {
    await assert.rejects(new PaidImages(root, provider).image(input, "normalize", "v1", "test"), /DISABLED/);
    assert.equal(calls, 0);
    const paid = new PaidImages(root, provider, true);
    await assert.rejects(paid.image(input, "normalize", "v1", "test"), /interrupted/);
    await assert.rejects(paid.image(input, "normalize", "v1", "test"), /UNKNOWN/);
    assert.equal(calls, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
