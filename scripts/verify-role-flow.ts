/** Real local rendering using previously paid, user-accepted AI responses. No cloud calls. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { AvatarService } from "../apps/server/src/avatar-service.ts";
import { ZenMuxPortraitStandardizer } from "../apps/server/src/portrait-standardizer.ts";
import { loadLocalEnv } from "./env.ts";
await loadLocalEnv();
const validator=new ZenMuxPortraitStandardizer();
const root=resolve("artifacts/role-flow",String(Date.now()));await mkdir(root,{recursive:true});
const records=JSON.parse(await readFile("artifacts/portrait-verification-v3/requests.json","utf8")) as {name:string;source:string;file?:string;status:string;sha256?:string}[];
const photos=await Promise.all(records.filter(r=>r.status==="valid").map(async r=>({...r,original:await readFile(r.source),generated:await readFile(r.file!)})));
assert.equal(photos.length,2);
const hash=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
for(const p of photos)assert.equal(hash(p.generated),p.sha256);
let replayRequests=0;const beforeHashes=photos.map(p=>hash(p.original));
const service=new AvatarService(root,undefined,{primary:validator.primary,fallback:validator.fallback,
  validate:(path,signal)=>validator.validate(path,signal),generate:async(source,model)=>{
    replayRequests++;const bytes=await readFile(source),photo=photos.find(p=>hash(p.original)===hash(bytes));
    assert.ok(photo,"unrecognized fixture: refusing cloud request");
    if(model===validator.primary)throw Error("图片服务请求失败（HTTP 500）");
    return {bytes:photo.generated,mime:"image/png",model,elapsedMs:0,usage:{}};
  }});
await service.initialized;
const server=createServer((req,res)=>void service.handle(req,res));await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/avatars`;
const pauseChecks:unknown[]=[];
try {
  const submitted=await fetch(base+"/batches",{method:"POST",headers:{"content-type":"application/json","x-avatar-upload":"1"},body:JSON.stringify({requestId:randomUUID(),files:[
    ...photos.map(p=>({name:p.name+" · 新版照片",type:"image/png",data:p.original.toString("base64")})),{name:"无效照片测试",type:"image/png",data:"invalid"}]})});
  assert.equal(submitted.status,202);let paused=false;const started=Date.now();let last="";
  while(Date.now()-started<600_000) {
    const jobs=service.store.list(),snapshot=jobs.map(j=>`${j.name}:${j.status}:${j.stage}`).join(" | ");
    if(snapshot!==last){console.log(snapshot);last=snapshot;}
    const ready=jobs.find(j=>j.status==="ready"),working=jobs.find(j=>j.status==="processing"&&["landmarks","video","identity"].includes(j.stage));
    if(!paused&&ready&&working) {
      const at=performance.now();await service.acquireCall(ready.id,"flow-pause",new AbortController().signal);
      pauseChecks.push({elapsedMs:Math.round(performance.now()-at),states:service.store.list().map(j=>j.status),replayRequests});
      await new Promise(r=>setTimeout(r,300));service.releaseCall("flow-pause");paused=true;
    }
    if(jobs.length===3&&jobs.every(j=>["ready","failed"].includes(j.status)))break;
    await new Promise(r=>setTimeout(r,250));
  }
  const jobs=service.store.list();assert.equal(jobs.filter(j=>j.status==="ready").length,2);assert.equal(jobs.filter(j=>j.status==="failed").length,1);
  assert.equal(replayRequests,4);assert.ok(paused,"must exercise call priority during real local rendering");
  for(let i=0;i<photos.length;i++)assert.equal(hash(await readFile(photos[i]!.source)),beforeHashes[i]);
  await writeFile(resolve(root,"verification.json"),JSON.stringify({passed:true,root,cloudCalls:0,replayedModelResponses:replayRequests,pauseChecks,jobs,originalsUnchanged:true},null,2));
  console.log(JSON.stringify({passed:true,report:resolve(root,"verification.json")}));
}finally{await service.dispose();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
