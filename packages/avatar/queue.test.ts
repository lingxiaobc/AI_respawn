import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AvatarService } from "../../apps/server/src/avatar-service.ts";
const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
async function assets(dir:string) {
  await mkdir(join(dir,"assets"),{recursive:true});
  for(const file of ["frame.html","profile.json","source.jpg","assets/01.mp4","assets/combined_data.json.gz"])await writeFile(join(dir,file),"asset");
}
async function until(check:()=>boolean) {
  for(let i=0;i<300;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}
  assert.fail("state did not settle");
}
test("three-photo batch yields to a call, resumes only unfinished roles and isolates failures", async t=>{
  const root=await mkdtemp(join(tmpdir(),"avatar-queue-"));
  let running=0,max=0;
  const seen=new Map<string,number>();
  const service=new AvatarService(root,async(dir,id,progress,signal)=>{
    running++;max=Math.max(max,running);
    seen.set(id,(seen.get(id)??0)+1);
    try {
      if(seen.size===2&&seen.get(id)===1) {
        progress("identity",60);
        await new Promise<void>((resolve,reject)=>{
          const aborted=()=>reject(signal.reason);
          signal.addEventListener("abort",aborted,{once:true});
          if(signal.aborted)aborted();
        });
      }
      await assets(dir);
    } finally {running--;}
  });
  const server=createServer((req,res)=>{void service.handle(req,res);});
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  t.after(async()=>{await service.dispose();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});});
  const port=(server.address() as {port:number}).port;
  const requestId=randomUUID(), file={name:"人物.png",type:"image/png",data:png.toString("base64")};
  const submit=(files:unknown[],key=requestId)=>fetch(`http://127.0.0.1:${port}/api/avatars/batches`,{
    method:"POST",headers:{"content-type":"application/json","x-avatar-upload":"1",origin:"http://127.0.0.1:5173"},
    body:JSON.stringify({requestId:key,files})});
  assert.equal((await submit([file,file,file,file])).status,400);
  assert.equal(service.store.list().length,0);
  assert.equal((await submit([file,file,file])).status,202);
  await until(()=>service.store.list().filter(j=>j.status==="ready").length===1&&running===1);
  const first=service.store.list()[0]!;
  assert.equal((await submit([file,file,file])).status,200);
  assert.equal(service.store.list().length,3);
  const abort=new AbortController();
  await service.acquireCall(first.id,"call-1",abort.signal);
  assert.equal(running,0);assert.equal(max,1);
  assert.equal(service.store.list().filter(j=>j.status==="paused").length,2);
  await assert.rejects(service.acquireCall(first.id,"call-2",new AbortController().signal));
  service.releaseCall("stale-call");
  assert.equal(service.callActive,true);
  service.releaseCall("call-1");
  await until(()=>service.store.list().every(j=>j.status==="ready"));
  assert.equal(seen.get(first.id),1);assert.equal(max,1);
  assert.equal([...seen.values()].reduce((a,b)=>a+b,0),4);
  assert.equal((await submit([file,{...file,data:"broken"},file],randomUUID())).status,202);
  await until(()=>service.store.list().filter(j=>j.status==="ready").length===5);
  assert.equal(service.store.list().filter(j=>j.status==="failed").length,1);
  assert.equal((await submit([file],randomUUID())).status,202);
  await until(()=>service.store.list().filter(j=>j.status==="ready").length===6);
  assert.equal(max,1); // No global limit of five and no parallel workers.
});

test("a processing failure does not stop a two-photo batch; retry preserves successful roles",async t=>{
  const root=await mkdtemp(join(tmpdir(),"avatar-retry-"));
  const attempts=new Map<string,number>();
  let brokenId="";
  const service=new AvatarService(root,async(dir,id)=>{
    brokenId ||= id;attempts.set(id,(attempts.get(id)??0)+1);
    if(id===brokenId&&attempts.get(id)===1)throw Error("请使用清晰的单人照片");
    await assets(dir);
  });
  const server=createServer((req,res)=>{void service.handle(req,res);});
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  t.after(async()=>{await service.dispose();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/avatars`;
  const file={name:"人物.png",type:"image/png",data:png.toString("base64")};
  const response=await fetch(base+"/batches",{method:"POST",headers:{"content-type":"application/json","x-avatar-upload":"1"},
    body:JSON.stringify({requestId:randomUUID(),files:[file,file]})});
  assert.equal(response.status,202);
  await until(()=>service.store.list().some(j=>j.status==="failed")&&service.store.list().some(j=>j.status==="ready"));
  const ready=service.store.list().find(j=>j.status==="ready")!;
  const retry=()=>fetch(`${base}/${brokenId}/retry`,{method:"POST",headers:{"x-avatar-upload":"1"}});
  assert.deepEqual((await Promise.all([retry(),retry()])).map(r=>r.status).sort(),[200,202]);
  await until(()=>service.store.list().every(j=>j.status==="ready"));
  assert.equal(attempts.get(brokenId),2);assert.equal(attempts.get(ready.id),1);
  assert.equal(service.store.get(ready.id)?.assetPath,ready.assetPath);
  await service.stop();assert.equal((await retry()).status,503);
});
