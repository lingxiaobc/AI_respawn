import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AvatarStore } from "../../apps/server/src/avatar-store.ts";

test("SQLite imports legacy roles once and recovers unfinished tasks without replay", async () => {
  const root = await mkdtemp(join(tmpdir(), "avatar-db-"));
  const id = "11111111-1111-1111-1111-111111111111";
  await mkdir(join(root, id, "assets"), { recursive: true });
  await writeFile(join(root, id, "job.json"), JSON.stringify({ id, status: "ready" }));
  for (const file of ["frame.html","profile.json","source.jpg","assets/01.mp4","assets/combined_data.json.gz"])
    await writeFile(join(root, id, file), "legacy");
  let db = new AvatarStore(root);
  try {
    await db.importLegacy(); await db.importLegacy();
    assert.equal(db.list().length, 1); assert.equal(db.get(id)?.status, "ready");
    const queued = { ...db.get(id)!, id: "22222222-2222-2222-2222-222222222222", status: "queued" as const };
    db.save(queued);
    db.startCall("old-call", id);
    assert.equal(db.db.prepare("SELECT usage_json FROM calls WHERE id='old-call'").get()?.usage_json,null);
    const usageEvent={type:"response.done",event_id:"event_one",response:{id:"response_one",usage:{
      input_tokens:3,output_tokens:5,total_tokens:8,text:"private",audio:"secret",cost:-2}}};
    db.recordUsage("old-call",usageEvent);db.recordUsage("old-call",usageEvent);
    const saved=JSON.parse(String(db.db.prepare("SELECT usage_json FROM calls WHERE id='old-call'").get()?.usage_json));
    assert.equal(saved.length,1);
    assert.deepEqual(saved[0].values,{input_tokens:3,output_tokens:5,total_tokens:8});
    db.db.prepare("UPDATE calls SET ended_at='2000-01-01',usage_json=NULL").run();
    db.close(); db = new AvatarStore(root);
    assert.equal(db.get(id)?.status, "ready");
    assert.equal(db.get(queued.id)?.status, "interrupted");
    assert.equal(db.db.prepare("SELECT count(*) n FROM calls").get()?.n, 0);
    assert.throws(() => db.transaction(() => { db.addBatch("rolled-back","duplicate"); throw Error("rollback"); }));
    assert.equal(db.batchByKey("duplicate"), undefined);
    const damagedId = "33333333-3333-3333-3333-333333333333";
    await mkdir(join(root, damagedId));
    await writeFile(join(root, damagedId, "job.json"), "{broken");
    await db.importLegacy();
    assert.equal(db.get(damagedId)?.status, "interrupted");
    assert.match(db.get(damagedId)?.message ?? "", /不完整/);
    const missingId = "44444444-4444-4444-4444-444444444444";
    await mkdir(join(root, missingId));
    await writeFile(join(root, missingId, "job.json"), JSON.stringify({id:missingId,status:"ready"}));
    await db.importLegacy();
    assert.equal(db.get(missingId)?.status, "interrupted");
    assert.equal(db.get(missingId)?.assetPath, undefined);
  } finally { db.close(); await rm(root, { recursive: true, force: true }); }
});
