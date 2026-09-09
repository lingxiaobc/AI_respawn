/** Explicit local integration check. Real Python/ffmpeg, no provider credentials or calls. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
import { AvatarService } from "../apps/server/src/avatar-service.ts";
const exec=promisify(execFile);
const root=resolve("artifacts/batch-call-verification",String(Date.now()));
await mkdir(root,{recursive:true});
const service=new AvatarService(root);
const server=createServer((req,res)=>{void service.handle(req,res);});
await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
const port=(server.address() as {port:number}).port;
const report:Record<string,unknown>={root,started:new Date().toISOString()};
const poll=async(check:()=>boolean,timeout=180000)=>{
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(check())return;await new Promise(r=>setTimeout(r,20));}
  throw new Error("Timed out waiting for pipeline state");
};
async function processes() {
  const escaped=root.replaceAll("'","''");
  const cmd=`Get-CimInstance Win32_Process | Where-Object { ($_.Name -like '*python*' -or $_.Name -like '*ffmpeg*') -and $_.CommandLine -like '*${escaped}*' } | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress`;
  const result=await exec("powershell.exe",["-NoProfile","-Command",cmd],{windowsHide:true});
  if(!result.stdout.trim())return [];
  const parsed=JSON.parse(result.stdout);return Array.isArray(parsed)?parsed:[parsed];
}
try {
  const paths=["青年.png","50多岁女性.png","老人1.png"].map(name=>resolve("测试图片",name));
  const files=await Promise.all(paths.map(async path=>({name:path.split(/[\\/]/).at(-1)!,type:"image/png",data:(await readFile(path)).toString("base64")})));
  const hashes=files.map(f=>createHash("sha256").update(Buffer.from(f.data,"base64")).digest("hex"));
  const response=await fetch(`http://127.0.0.1:${port}/api/avatars/batches`,{method:"POST",
    headers:{"content-type":"application/json","x-avatar-upload":"1",origin:"http://127.0.0.1:5173"},
    body:JSON.stringify({requestId:randomUUID(),files})});
  assert.equal(response.status,202);
  await poll(()=>service.store.list()[0]?.status==="ready"&&service.store.list()[1]?.status==="processing");
  report.before=await processes();
  assert.ok((report.before as unknown[]).length>0,"real worker must be present before priority handoff");
  const roles=service.store.list();
  assert.equal(roles[1]?.status,"processing","second photo must still be processing");
  const start=performance.now();
  await service.acquireCall(roles[0]!.id,"local-priority-check",new AbortController().signal);
  report.pauseMs=Math.round(performance.now()-start);
  report.during=await processes();
  assert.equal((report.during as unknown[]).length,0,"no Python/ffmpeg work during call");
  assert.equal(service.store.list().filter(j=>j.status==="paused").length,2);
  service.releaseCall("local-priority-check");
  await poll(()=>service.store.list().every(j=>j.status==="ready"));
  const ready=service.store.list();
  report.roles=ready.map(j=>({id:j.id,name:j.name,status:j.status,attempts:j.attempt}));
  assert.equal(ready[0]!.attempt,1);assert.equal(ready[1]!.attempt,2);assert.equal(ready[2]!.attempt,1);
  for(const role of ready)assert.equal((await readdir(join(root,role.id,"attempts"))).length,1,"unpublished interrupted output cleaned");
  for(let i=0;i<paths.length;i++)assert.equal(createHash("sha256").update(await readFile(paths[i]!)).digest("hex"),hashes[i]);
  report.originalsUnchanged=true;
  await service.dispose();
  const restarted=new AvatarService(root);await restarted.initialized;
  assert.equal(restarted.store.list().filter(j=>j.status==="ready").length,3);
  report.restartReady=3;await restarted.dispose();
  report.result="PASS";
}catch(error){report.result="FAIL";report.error=error instanceof Error?error.message:String(error);await service.dispose().catch(()=>{});process.exitCode=1;}
finally {
  server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));
  await writeFile(join(root,"verification.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
