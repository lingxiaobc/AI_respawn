import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RolePipeline } from "../../packages/role-resource/src/pipeline.ts";
import { PaidImages } from "../../packages/role-resource/src/paid-images.ts";
import { serveRoles } from "./src/role-http.ts";
test("role API authenticates, rejects multiple images, bad JSON and origins",async()=>{
  const root=await mkdtemp(join(tmpdir(),"role-http-"));
  const pipeline=new RolePipeline({root,python:"unused",paid:new PaidImages(join(root,"paid"),{edit:async()=>{throw new Error("forbidden");}})});
  await pipeline.initialize();const token=randomBytes(24).toString("hex"),server=await serveRoles(pipeline,0,token);
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try{
    assert.equal((await fetch(base+"/api/roles")).status,401);
    const headers={authorization:`Bearer ${token}`,"content-type":"application/json"};
    assert.equal((await fetch(base+"/api/roles",{headers})).status,200);
    assert.equal((await fetch(base+"/api/roles",{headers:{...headers,origin:"https://other.invalid"}})).status,403);
    assert.equal((await fetch(base+"/api/roles",{method:"POST",headers,body:JSON.stringify({files:[{},{}]})})).status,400);
    assert.equal((await fetch(base+"/api/roles",{method:"POST",headers,body:"invalid"})).status,400);
    assert.equal((await pipeline.store.list()).length,0);
  }finally{await new Promise<void>(r=>server.close(()=>r()));await pipeline.close();await rm(root,{recursive:true,force:true});}
});
