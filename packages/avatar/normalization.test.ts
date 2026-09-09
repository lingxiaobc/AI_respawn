import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { AvatarService } from "../../apps/server/src/avatar-service.ts";
import type { PortraitStandardizer, ImageResult } from "../../apps/server/src/portrait-standardizer.ts";
import { PortraitValidationUnavailableError } from "../../apps/server/src/portrait-standardizer.ts";
import { AvatarStore } from "../../apps/server/src/avatar-store.ts";
import type { ProcessJob } from "../../apps/server/src/avatar-worker.ts";
const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
const result=(model:string):ImageResult=>({bytes:png,mime:"image/png",model,elapsedMs:1,usage:{total_tokens:2}});
const headers={"x-avatar-upload":"1","content-type":"application/json"};
const wait=async(check:()=>boolean)=>{for(let i=0;i<300;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail("state did not settle");};
const assets:ProcessJob=async dir=>{await mkdir(join(dir,"assets"),{recursive:true});for(const f of ["frame.html","source.jpg","profile.json","assets/01.mp4","assets/combined_data.json.gz"])await writeFile(join(dir,f),"asset");};
async function setup(t:{after:(fn:()=>Promise<void>)=>void},client:PortraitStandardizer,runner=assets){
  const root=await mkdtemp(join(tmpdir(),"avatar-normalize-"));const service=new AvatarService(root,runner,client);await service.initialized;
  const server=createServer((req,res)=>void service.handle(req,res));await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/avatars`;
  t.after(async()=>{await service.dispose();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});});
  const upload=async(count=1)=>(await(await fetch(base+"/batches",{method:"POST",headers,body:JSON.stringify({requestId:randomUUID(),files:Array.from({length:count},(_,i)=>({name:`role-${i}.png`,type:"image/png",data:png.toString("base64")}))})})).json()).avatars as {id:string}[];
  const retry=(id:string)=>fetch(`${base}/${id}/retry`,{method:"POST",headers});
  return {root,service,base,upload,retry};
}
test("each photo has at most primary plus fallback; one failure does not block others",async t=>{
  const seen=new Map<string,string[]>();let bad="";let first="";
  const client:PortraitStandardizer={primary:"primary",fallback:"fallback",validate:async()=>{},generate:async(source,model)=>{
    first ||= source;if(source!==first&&!bad)bad=source;
    const list=seen.get(source)??[];list.push(model);seen.set(source,list);
    if(source===bad||source===first&&model==="primary")throw Error("图片服务请求失败（HTTP 500）");return result(model);
  }};
  const {service,upload,retry,base}=await setup(t,client);const jobs=await upload(3);
  await wait(()=>service.store.list().every(j=>["ready","failed"].includes(j.status)));
  assert.deepEqual(service.store.list().map(j=>j.status),["ready","failed","ready"]);
  assert.deepEqual([...seen.values()],[ ["primary","fallback"],["primary","fallback"],["primary"] ]);
  const publicData=await(await fetch(base)).json();assert.ok(!JSON.stringify(publicData).includes("candidatePath"));assert.ok(!JSON.stringify(publicData).includes("normalizedPath"));
  bad="disabled";assert.equal((await retry(jobs[1]!.id)).status,202);await wait(()=>service.store.active(jobs[1]!.id)?.status==="ready");
  assert.equal(seen.get(first)?.length,2);
});
test("cloud output survives call priority without delaying the call or invoking fallback",async t=>{
  let settle:((v:ImageResult)=>void)|undefined;let calls=0,validations=0,renders=0;
  const client:PortraitStandardizer={primary:"primary",fallback:"fallback",generate:async()=>{calls++;return new Promise(r=>{settle=r;});},validate:async()=>{validations++;}};
  const {service,upload}=await setup(t,client,async(...args)=>{renders++;await assets(...args);});
  const [job]=await upload();await wait(()=>!!settle);
  const start=performance.now();await service.acquireCall(undefined,"call",new AbortController().signal);assert.ok(performance.now()-start<200);
  settle!(result("primary"));await wait(()=>service.store.get(job!.id)?.normalization?.state==="received");
  assert.equal(validations,0);assert.equal(renders,0);assert.equal(calls,1);
  assert.ok(await readFile(service.store.get(job!.id)!.normalization!.candidatePath!));
  service.releaseCall("call");await wait(()=>service.store.active(job!.id)?.status==="ready");
  assert.equal(calls,1);assert.equal(validations,1);assert.equal(renders,1);
});
test("archive during a cloud request preserves bytes but suppresses validation, fallback and revival",async t=>{
  let settle:((v:ImageResult)=>void)|undefined;let validations=0,calls=0;
  const {service,upload,base}=await setup(t,{primary:"primary",fallback:"fallback",generate:async()=>{calls++;return new Promise(r=>{settle=r;});},validate:async()=>{validations++;}});
  const [job]=await upload();await wait(()=>!!settle);
  assert.equal((await fetch(`${base}/${job!.id}`,{method:"DELETE",headers})).status,200);
  settle!(result("primary"));await wait(()=>service.store.get(job!.id)?.normalization?.state==="received");
  await new Promise(r=>setTimeout(r,30));assert.equal(service.store.list().length,0);assert.equal(validations,0);assert.equal(calls,1);
  assert.ok(await readFile(service.store.get(job!.id)!.normalization!.candidatePath!));
});
test("local failure and retry reuse a completed standard image",async t=>{
  let calls=0,renders=0;const client:PortraitStandardizer={primary:"primary",fallback:"fallback",generate:async(_s,m)=>{calls++;return result(m);},validate:async()=>{}};
  const {service,upload,retry}=await setup(t,client,async(...args)=>{if(++renders===1)throw Error("local render fault");await assets(...args);});
  const [job]=await upload();await wait(()=>service.store.get(job!.id)?.status==="failed");
  const standard=service.store.get(job!.id)!.normalizedPath;assert.ok(standard);
  await retry(job!.id);await wait(()=>service.store.get(job!.id)?.status==="ready");
  assert.equal(calls,1);assert.equal(renders,2);assert.equal(service.store.get(job!.id)?.normalizedPath,standard);
});
test("primary failure arriving during a call defers the fallback until hangup",async t=>{
  let fail:((e:Error)=>void)|undefined;const calls:string[]=[];
  const {service,upload}=await setup(t,{primary:"primary",fallback:"fallback",generate:async(_s,m)=>{calls.push(m);return m==="primary"?new Promise((_r,reject)=>{fail=reject;}):result(m);},validate:async()=>{}});
  const [job]=await upload();await wait(()=>!!fail);await service.acquireCall(undefined,"call",new AbortController().signal);
  fail!(Error("failed"));await wait(()=>service.store.get(job!.id)?.normalization?.slot==="fallback");assert.deepEqual(calls,["primary"]);
  service.releaseCall("call");await wait(()=>service.store.get(job!.id)?.status==="ready");assert.deepEqual(calls,["primary","fallback"]);
});
test("unusable primary image is replaced once",async t=>{
  let calls=0,validations=0;
  const {service,upload}=await setup(t,{primary:"primary",fallback:"fallback",generate:async(_s,m)=>{calls++;return result(m);},validate:async()=>{if(++validations===1)throw Error("no face");}});
  const [job]=await upload();await wait(()=>service.store.get(job!.id)?.status==="ready");assert.equal(calls,2);assert.equal(validations,2);
});
test("call priority cancels validation and resumes the received image without generation",async t=>{
  let calls=0,validations=0,validating=false;
  const {service,upload}=await setup(t,{primary:"primary",fallback:"fallback",generate:async(_s,m)=>{calls++;return result(m);},validate:async(_path,signal)=>{
    validations++;if(validations===1){validating=true;try{await new Promise<void>((_r,reject)=>signal.addEventListener("abort",()=>reject(signal.reason),{once:true}));}finally{validating=false;}}
  }});
  const [job]=await upload();await wait(()=>validating);await service.acquireCall(undefined,"call",new AbortController().signal);
  assert.equal(validating,false);assert.equal(service.store.get(job!.id)?.normalization?.state,"received");assert.equal(calls,1);
  service.releaseCall("call");await wait(()=>service.store.get(job!.id)?.status==="ready");assert.equal(calls,1);assert.equal(validations,2);
});
test("local validation infrastructure failure retains the paid image and never invokes fallback",async t=>{
  let calls=0,healthy=false;
  const {service,upload,retry}=await setup(t,{primary:"primary",fallback:"fallback",generate:async(_s,m)=>{calls++;return result(m);},validate:async()=>{if(!healthy)throw new PortraitValidationUnavailableError("校验环境不可用");}});
  const [job]=await upload();await wait(()=>service.store.get(job!.id)?.status==="failed");assert.equal(calls,1);assert.equal(service.store.get(job!.id)?.normalization?.state,"received");
  healthy=true;await retry(job!.id);await wait(()=>service.store.get(job!.id)?.status==="ready");assert.equal(calls,1);
});
test("restart preserves received/ready checkpoints and never replays an uncertain paid request",async t=>{
  const root=await mkdtemp(join(tmpdir(),"avatar-normalize-restart-")),candidate=join(root,"candidate.png");await writeFile(candidate,png);
  const store=new AvatarStore(root),batch=randomUUID(),ids=[randomUUID(),randomUUID(),randomUUID()];store.addBatch(batch,batch);
  for(const [index,state] of (["received","ready","requesting"] as const).entries())store.save({id:ids[index]!,batchId:batch,name:state,status:"processing",stage:"standardizing",percent:2,createdAt:new Date().toISOString(),sourcePath:candidate,attempt:1,
    normalization:{state,slot:"primary",...(state!=="requesting"?{candidatePath:candidate}:{})},...(state==="ready"?{normalizedPath:candidate}:{})});
  store.close();let calls=0,validations=0;
  const service=new AvatarService(root,assets,{primary:"primary",fallback:"fallback",generate:async(_s,m)=>{calls++;return result(m);},validate:async()=>{validations++;}});await service.initialized;
  const server=createServer((req,res)=>void service.handle(req,res));await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/avatars`;
  t.after(async()=>{await service.dispose();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});});
  assert.ok(service.store.list().every(j=>j.status==="interrupted"));assert.equal(calls,0);
  for(const id of ids.slice(0,2)){assert.equal((await fetch(`${base}/${id}/retry`,{method:"POST",headers})).status,202);await wait(()=>service.store.get(id)?.status==="ready");}
  assert.equal(calls,0);assert.equal(validations,1);assert.equal(service.store.get(ids[2]!)?.status,"interrupted");
  assert.equal((await fetch(`${base}/${ids[2]}/retry`,{method:"POST",headers})).status,202);await wait(()=>service.store.get(ids[2]!)?.status==="ready");assert.equal(calls,1);
});
