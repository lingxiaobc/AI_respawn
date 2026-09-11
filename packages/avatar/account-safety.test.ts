import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { AvatarService } from "../../apps/server/src/avatar-service.ts";
import { AvatarStore } from "../../apps/server/src/avatar-store.ts";
import { AuthError, AuthStore } from "../../apps/server/src/auth-store.ts";
import { backupBeforeAccounts } from "../../apps/server/src/account-migration.ts";
import { assertPrivateStorage } from "../../apps/server/src/storage-safety.ts";

test("storage migration backs up WAL records; web/public storage is rejected and initial exception is explicit", async () => {
  assert.throws(() => assertPrivateStorage(resolve("apps/web/public/private-store")), /outside apps\/web/);
  assertPrivateStorage(resolve("artifacts/avatars"));
  const root = await fs.mkdtemp(join(tmpdir(), "account-migration-")), store = new AvatarStore(root);
  try {
    const id = randomUUID(); store.addBatch(id, id);
    store.save({ id, batchId:id, name:"保留人物",persona:"保留设定",status:"ready",stage:"ready",percent:100,createdAt:new Date().toISOString(),sourcePath:"kept",attempt:0 });
    await backupBeforeAccounts(root);
    const name = (await fs.readdir(root)).find(f => f.startsWith("before-accounts-"))!; assert.ok(name);
    const copy = new DatabaseSync(join(root,name), {readOnly:true});
    try { assert.equal(copy.prepare("SELECT name FROM avatars WHERE id=?").get(id)?.name, "保留人物"); } finally { copy.close(); }
    const auth = new AuthStore(store.db);
    await assert.rejects(auth.initialize("0123456789"), /12/);
    await auth.initialize("0123456789", true);
    assert.equal((await auth.login("lenox", "0123456789", 3600, 7200)).user.user_type, "ADMIN");
    assert.equal(store.active(id)?.persona, "保留设定");
  } finally { store.close(); await fs.rm(root,{recursive:true,force:true}); }
});

test("revoked upload attempts every cleanup; failed directories stay quarantined and retry on restart", async t => {
  const root = await fs.mkdtemp(join(tmpdir(), "account-upload-"));
  let service = new AvatarService(root), checks = 0;
  const server = createServer((req,res) => void service.handle(req,res,{admin:true,role:a=>a,check:()=>{if(++checks===3)throw new AuthError(401,"revoked");}}));
  await new Promise<void>(r => server.listen(0,"127.0.0.1",r));
  const original = fs.rm; let attempts=0;
  const mocked = t.mock.method(fs,"rm",async (...args: Parameters<typeof fs.rm>) => {
    if(String(args[0]).startsWith(root)&&++attempts===1)throw Object.assign(new Error("Busy test directory"),{code:"EBUSY"});
    return original(...args);
  }); syncBuiltinESMExports();
  try {
    const photo=Buffer.from([137,80,78,71,13,10,26,10,0]).toString("base64");
    const result=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/avatars/batches`,{method:"POST",headers:{origin:"http://127.0.0.1:5173","x-avatar-upload":"1","content-type":"application/json"},
      body:JSON.stringify({requestId:randomUUID(),files:[{name:"one",type:"image/png",data:photo},{name:"two",type:"image/png",data:photo}]})});
    assert.equal(result.status,503);assert.equal(attempts,2);
    assert.equal(service.store.db.prepare("SELECT COUNT(*) AS n FROM uncommitted_uploads").get()?.n,1);
    await service.store.importLegacy();assert.equal(service.store.list().length,0);
    mocked.mock.restore();syncBuiltinESMExports();
    await service.dispose();service=new AvatarService(root);await service.initialized;
    assert.equal(service.store.db.prepare("SELECT COUNT(*) AS n FROM uncommitted_uploads").get()?.n,0);
    assert.equal(service.store.list().length,0);
  } finally {mocked.mock.restore();syncBuiltinESMExports();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await service.dispose();await fs.rm(root,{recursive:true,force:true});}
});
